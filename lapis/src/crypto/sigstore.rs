use crate::crypto::blake3::hash_bytes;
use crate::error::{LapisError, Result};
use const_oid::ObjectIdentifier;
use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::Digest;
use sigstore::bundle::sign::SigningContext;
use sigstore::bundle::verify::{blocking::Verifier, policy};
use sigstore::bundle::Bundle;
use sigstore::crypto::signing_key::SigStoreKeyPair;
use sigstore::crypto::{CosignVerificationKey, Signature, SigningScheme};
use sigstore::oauth::IdentityToken;
use sigstore_oidc::{get_identity_token_with_options, AuthOptions};
use sigstore_protobuf_specs::dev::sigstore::bundle::v1::{bundle, verification_material};
use std::fs;
use std::io::Cursor;
use x509_cert::der::{Decode, DecodePem, Encode};
use x509_cert::ext::pkix::{name::GeneralName, SubjectAltName};
use x509_cert::Certificate;

const DEFAULT_SIGNING_SCHEME: &str = "ECDSA_P256_SHA256_ASN1";
const OIDC_ISSUER_OID: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.3.6.1.4.1.57264.1.1");
const OTHERNAME_OID: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.3.6.1.4.1.57264.1.7");
const FORMAT_SIGSTORE_BUNDLE: &str = "sigstore-bundle";
const FORMAT_SIGSTORE_FIXTURE: &str = "sigstore-fixture";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerifiedSigner {
    pub identity: String,
    pub issuer: Option<String>,
    pub key_id: String,
    pub scheme: String,
}

#[derive(Debug, Clone)]
struct SigningConfig {
    mode: SigningMode,
}

#[derive(Debug, Clone)]
enum SigningMode {
    KeylessToken(String),
    InteractiveOidc {
        force_oob: bool,
    },
    PrebuiltBundlePath(String),
    Fixture {
        certificate_pem: String,
        private_key_pem: Vec<u8>,
        scheme: SigningScheme,
    },
}

struct VerificationConfig {
    identity_regexp: Regex,
    issuer_regexp: Regex,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredSignature {
    version: u8,
    format: String,
    scheme: String,
    bundle_json: Option<String>,
    certificate_pem: Option<String>,
    signature_hex: Option<String>,
}

pub fn sign_commit_payload(payload: &[u8]) -> Result<Vec<u8>> {
    let config = load_signing_config()?;
    sign_commit_payload_with_config(payload, &config)
}

pub fn verify_commit_payload(payload: &[u8], signature: &[u8]) -> Result<VerifiedSigner> {
    let config = load_verification_config()?;
    verify_commit_payload_with_config(payload, signature, &config)
}

fn sign_commit_payload_with_config(payload: &[u8], config: &SigningConfig) -> Result<Vec<u8>> {
    let stored = match &config.mode {
        SigningMode::KeylessToken(raw_token) => {
            sign_with_sigstore_identity_token(payload, raw_token.clone())?
        }
        SigningMode::InteractiveOidc { force_oob } => {
            let raw_token = acquire_oidc_identity_token(*force_oob)?;
            sign_with_sigstore_identity_token(payload, raw_token)?
        }
        SigningMode::PrebuiltBundlePath(path) => {
            let bundle_json = fs::read_to_string(path).map_err(|e| {
                LapisError::Commit(format!("Failed to read Sigstore bundle '{}': {}", path, e))
            })?;
            let bundle: Bundle = serde_json::from_str(&bundle_json).map_err(|e| {
                LapisError::Commit(format!("Invalid Sigstore bundle JSON in '{}': {}", path, e))
            })?;
            ensure_bundle_matches_payload(payload, &bundle)?;

            StoredSignature {
                version: 2,
                format: FORMAT_SIGSTORE_BUNDLE.to_string(),
                scheme: "sigstore-prebuilt-bundle".to_string(),
                bundle_json: Some(bundle_json),
                certificate_pem: None,
                signature_hex: None,
            }
        }
        SigningMode::Fixture {
            certificate_pem,
            private_key_pem,
            scheme,
        } => {
            let key_pair = SigStoreKeyPair::from_pem(private_key_pem).map_err(sigstore_err)?;
            let signer = key_pair.to_sigstore_signer(scheme).map_err(sigstore_err)?;
            let signature = signer.sign(payload).map_err(sigstore_err)?;

            StoredSignature {
                version: 2,
                format: FORMAT_SIGSTORE_FIXTURE.to_string(),
                scheme: scheme.to_string(),
                bundle_json: None,
                certificate_pem: Some(certificate_pem.clone()),
                signature_hex: Some(hex::encode(signature)),
            }
        }
    };

    serde_json::to_vec(&stored)
        .map_err(|e| LapisError::Commit(format!("Failed to encode signature artifact: {}", e)))
}

fn sign_with_sigstore_identity_token(payload: &[u8], raw_token: String) -> Result<StoredSignature> {
    let token = IdentityToken::try_from(raw_token.as_str()).map_err(sigstore_err)?;
    let context = SigningContext::production().map_err(sigstore_err)?;
    let session = context.blocking_signer(token).map_err(sigstore_err)?;
    let artifact = session.sign(Cursor::new(payload)).map_err(sigstore_err)?;
    let bundle_json = serde_json::to_string(&artifact.to_bundle())
        .map_err(|e| LapisError::Commit(format!("Failed to encode Sigstore bundle: {}", e)))?;

    Ok(StoredSignature {
        version: 2,
        format: FORMAT_SIGSTORE_BUNDLE.to_string(),
        scheme: "sigstore-keyless-bundle".to_string(),
        bundle_json: Some(bundle_json),
        certificate_pem: None,
        signature_hex: None,
    })
}

fn acquire_oidc_identity_token(force_oob: bool) -> Result<String> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| LapisError::Commit(format!("Failed to create OIDC runtime: {}", e)))?;
    let token = runtime
        .block_on(get_identity_token_with_options(AuthOptions { force_oob }))
        .map_err(sigstore_err)?;

    Ok(token.raw().to_string())
}

fn verify_commit_payload_with_config(
    payload: &[u8],
    signature: &[u8],
    config: &VerificationConfig,
) -> Result<VerifiedSigner> {
    let stored: StoredSignature = serde_json::from_slice(signature)
        .map_err(|e| LapisError::Commit(format!("Invalid stored signature format: {}", e)))?;

    if stored.version != 2 {
        return Err(LapisError::Commit(format!(
            "Unsupported signature artifact version: {}",
            stored.version
        )));
    }

    let signer = match stored.format.as_str() {
        FORMAT_SIGSTORE_BUNDLE => verify_sigstore_bundle(payload, &stored)?,
        FORMAT_SIGSTORE_FIXTURE => verify_sigstore_fixture(payload, &stored)?,
        other => {
            return Err(LapisError::Commit(format!(
                "Unsupported signature artifact format: {}",
                other
            )))
        }
    };

    enforce_verification_policy(&signer, config)?;
    Ok(signer)
}

fn verify_sigstore_bundle(payload: &[u8], stored: &StoredSignature) -> Result<VerifiedSigner> {
    let bundle_json = stored.bundle_json.as_ref().ok_or_else(|| {
        LapisError::Commit("Sigstore bundle artifact is missing bundle JSON".to_string())
    })?;
    let bundle: Bundle = serde_json::from_str(bundle_json)
        .map_err(|e| LapisError::Commit(format!("Invalid Sigstore bundle JSON: {}", e)))?;
    ensure_bundle_matches_payload(payload, &bundle)?;

    let signer = extract_signer_from_bundle(&bundle)?;
    let issuer = signer.issuer.clone().ok_or_else(|| {
        LapisError::Commit("Sigstore bundle signer is missing an OIDC issuer".to_string())
    })?;

    let verifier = Verifier::production().map_err(sigstore_err)?;
    let identity_policy = policy::Identity::new(&signer.identity, &issuer);
    verifier
        .verify(Cursor::new(payload), bundle, &identity_policy, true)
        .map_err(sigstore_err)?;

    Ok(signer)
}

fn verify_sigstore_fixture(payload: &[u8], stored: &StoredSignature) -> Result<VerifiedSigner> {
    let certificate_pem = stored.certificate_pem.as_ref().ok_or_else(|| {
        LapisError::Commit("Fixture signature artifact is missing certificate PEM".to_string())
    })?;
    let signature_hex = stored.signature_hex.as_ref().ok_or_else(|| {
        LapisError::Commit("Fixture signature artifact is missing signature bytes".to_string())
    })?;
    let certificate = Certificate::from_pem(certificate_pem)
        .map_err(|e| LapisError::Commit(format!("Invalid fixture certificate PEM: {}", e)))?;
    let signature_bytes = hex::decode(signature_hex)
        .map_err(|e| LapisError::Commit(format!("Invalid signature encoding: {}", e)))?;
    let verification_key: CosignVerificationKey =
        (&certificate.tbs_certificate.subject_public_key_info)
            .try_into()
            .map_err(sigstore_err)?;
    verification_key
        .verify_signature(Signature::Raw(&signature_bytes), payload)
        .map_err(sigstore_err)?;

    extract_signer_from_certificate(&certificate, stored.scheme.clone())
}

fn ensure_bundle_matches_payload(payload: &[u8], bundle: &Bundle) -> Result<()> {
    let digest = bundle
        .content
        .as_ref()
        .and_then(|content| match content {
            bundle::Content::MessageSignature(signature) => signature
                .message_digest
                .as_ref()
                .map(|digest| digest.digest.clone()),
            _ => None,
        })
        .ok_or_else(|| {
            LapisError::Commit("Sigstore bundle is missing a message digest".to_string())
        })?;

    let payload_digest = sha2::Sha256::digest(payload);
    if digest != payload_digest.as_slice() {
        return Err(LapisError::Commit(
            "Sigstore bundle digest does not match commit payload".to_string(),
        ));
    }

    Ok(())
}

fn extract_signer_from_bundle(bundle: &Bundle) -> Result<VerifiedSigner> {
    let cert_bytes = bundle
        .verification_material
        .as_ref()
        .and_then(|material| material.content.as_ref())
        .and_then(|content| match content {
            verification_material::Content::X509CertificateChain(chain) => chain
                .certificates
                .first()
                .map(|certificate| certificate.raw_bytes.clone()),
            verification_material::Content::Certificate(certificate) => {
                Some(certificate.raw_bytes.clone())
            }
            _ => None,
        })
        .ok_or_else(|| {
            LapisError::Commit("Sigstore bundle is missing a signing certificate".to_string())
        })?;

    let certificate = Certificate::from_der(&cert_bytes)
        .map_err(|e| LapisError::Commit(format!("Invalid Sigstore certificate DER: {}", e)))?;
    extract_signer_from_certificate(&certificate, "sigstore-keyless-bundle")
}

fn extract_signer_from_certificate(
    certificate: &Certificate,
    scheme: impl Into<String>,
) -> Result<VerifiedSigner> {
    let identity = extract_certificate_identity(certificate)?;
    let issuer = extract_certificate_oidc_issuer(certificate)?;
    let key_id = hex::encode(hash_bytes(
        &certificate
            .tbs_certificate
            .subject_public_key_info
            .to_der()
            .map_err(|e| LapisError::Commit(format!("Failed to encode public key info: {}", e)))?,
    ));

    Ok(VerifiedSigner {
        identity,
        issuer,
        key_id,
        scheme: scheme.into(),
    })
}

fn extract_certificate_identity(certificate: &Certificate) -> Result<String> {
    let (_, san): (bool, SubjectAltName) = certificate
        .tbs_certificate
        .get()
        .map_err(|e| LapisError::Commit(format!("Failed to read certificate SAN: {}", e)))?
        .ok_or_else(|| LapisError::Commit("Certificate is missing a SubjectAltName".to_string()))?;

    san.0
        .iter()
        .find_map(|name| match name {
            GeneralName::Rfc822Name(name) => Some(name.as_str().to_string()),
            GeneralName::UniformResourceIdentifier(name) => Some(name.as_str().to_string()),
            GeneralName::OtherName(name) if name.type_id == OTHERNAME_OID => {
                std::str::from_utf8(name.value.value())
                    .ok()
                    .map(str::to_string)
            }
            _ => None,
        })
        .ok_or_else(|| {
            LapisError::Commit(
                "Certificate SAN does not contain a supported Sigstore identity".to_string(),
            )
        })
}

fn extract_certificate_oidc_issuer(certificate: &Certificate) -> Result<Option<String>> {
    let extensions = certificate
        .tbs_certificate
        .extensions
        .as_deref()
        .unwrap_or(&[]);
    Ok(extensions
        .iter()
        .find(|extension| extension.extn_id == OIDC_ISSUER_OID)
        .and_then(|extension| std::str::from_utf8(extension.extn_value.as_bytes()).ok())
        .map(str::to_string))
}

fn enforce_verification_policy(signer: &VerifiedSigner, config: &VerificationConfig) -> Result<()> {
    if !config.identity_regexp.is_match(&signer.identity) {
        return Err(LapisError::Commit(format!(
            "Signer identity '{}' does not match {}",
            signer.identity,
            config.identity_regexp.as_str()
        )));
    }

    let issuer = signer.issuer.clone().unwrap_or_default();
    if !config.issuer_regexp.is_match(&issuer) {
        return Err(LapisError::Commit(format!(
            "Signer issuer '{}' does not match {}",
            issuer,
            config.issuer_regexp.as_str()
        )));
    }

    Ok(())
}

fn load_signing_config() -> Result<SigningConfig> {
    if let Some(token) = read_optional_env("LAPIS_SIGSTORE_ID_TOKEN") {
        return Ok(SigningConfig {
            mode: SigningMode::KeylessToken(token),
        });
    }

    if let Some(path) = read_optional_env("LAPIS_SIGSTORE_BUNDLE_PATH") {
        return Ok(SigningConfig {
            mode: SigningMode::PrebuiltBundlePath(path),
        });
    }

    if let (Some(certificate_pem), Some(private_key_path)) = (
        read_optional_env("LAPIS_SIGSTORE_FIXTURE_CERT_PEM"),
        read_optional_env("LAPIS_SIGSTORE_FIXTURE_PRIVATE_KEY"),
    ) {
        let private_key_pem = fs::read(&private_key_path).map_err(|e| {
            LapisError::Commit(format!(
                "Failed to read fixture signing key '{}': {}",
                private_key_path, e
            ))
        })?;

        return Ok(SigningConfig {
            mode: SigningMode::Fixture {
                certificate_pem,
                private_key_pem,
                scheme: load_signing_scheme()?,
            },
        });
    }

    Ok(SigningConfig {
        mode: SigningMode::InteractiveOidc {
            force_oob: read_bool_env("LAPIS_SIGSTORE_OIDC_FORCE_OOB"),
        },
    })
}

fn load_verification_config() -> Result<VerificationConfig> {
    Ok(VerificationConfig {
        identity_regexp: compile_regexp("LAPIS_SIGSTORE_IDENTITY_REGEXP", ".*", "identity")?,
        issuer_regexp: compile_regexp("LAPIS_SIGSTORE_OIDC_ISSUER_REGEXP", ".*", "issuer")?,
    })
}

fn load_signing_scheme() -> Result<SigningScheme> {
    let value = std::env::var("LAPIS_SIGSTORE_SIGNING_SCHEME")
        .unwrap_or_else(|_| DEFAULT_SIGNING_SCHEME.to_string());
    SigningScheme::try_from(value.as_str())
        .map_err(|e| LapisError::Commit(format!("Invalid LAPIS_SIGSTORE_SIGNING_SCHEME: {}", e)))
}

fn compile_regexp(env_key: &str, default: &str, label: &str) -> Result<Regex> {
    let value = std::env::var(env_key).unwrap_or_else(|_| default.to_string());
    Regex::new(&value)
        .map_err(|e| LapisError::Commit(format!("Invalid {} regexp in {}: {}", label, env_key, e)))
}

fn read_optional_env(key: &str) -> Option<String> {
    std::env::var(key).ok().and_then(|value| {
        let trimmed = value.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_string())
    })
}

fn read_bool_env(key: &str) -> bool {
    std::env::var(key)
        .ok()
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(false)
}

fn sigstore_err(error: impl std::fmt::Display) -> LapisError {
    LapisError::Commit(format!("Sigstore operation failed: {}", error))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rcgen::{CertificateParams, CustomExtension, KeyPair, SanType};
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn fixture_signing_config(identity: &str, issuer: &str) -> SigningConfig {
        let signer = SigningScheme::ECDSA_P256_SHA256_ASN1
            .create_signer()
            .expect("create signer");
        let key_pair = signer.to_sigstore_keypair().expect("key pair");
        let private_key_pem = key_pair.private_key_to_pem().expect("private key pem");
        let rcgen_key = KeyPair::from_pem(&private_key_pem).expect("rcgen key pair");

        let mut params = CertificateParams::new(vec![]).expect("cert params");
        params.subject_alt_names = vec![SanType::Rfc822Name(
            identity.to_string().try_into().expect("email san"),
        )];
        params
            .custom_extensions
            .push(CustomExtension::from_oid_content(
                &[1, 3, 6, 1, 4, 1, 57264, 1, 1],
                issuer.as_bytes().to_vec(),
            ));
        let certificate = params
            .self_signed(&rcgen_key)
            .expect("self signed certificate");

        SigningConfig {
            mode: SigningMode::Fixture {
                certificate_pem: certificate.pem(),
                private_key_pem: private_key_pem.to_string().into_bytes(),
                scheme: SigningScheme::ECDSA_P256_SHA256_ASN1,
            },
        }
    }

    fn permissive_verification_config() -> VerificationConfig {
        VerificationConfig {
            identity_regexp: Regex::new(".*").expect("identity regex"),
            issuer_regexp: Regex::new(".*").expect("issuer regex"),
        }
    }

    fn clear_signing_env() {
        std::env::remove_var("LAPIS_SIGSTORE_BUNDLE_PATH");
        std::env::remove_var("LAPIS_SIGSTORE_ID_TOKEN");
        std::env::remove_var("LAPIS_SIGSTORE_OIDC_FORCE_OOB");
        std::env::remove_var("LAPIS_SIGSTORE_FIXTURE_CERT_PEM");
        std::env::remove_var("LAPIS_SIGSTORE_FIXTURE_PRIVATE_KEY");
        std::env::remove_var("LAPIS_SIGSTORE_IDENTITY_REGEXP");
        std::env::remove_var("LAPIS_SIGSTORE_OIDC_ISSUER_REGEXP");
    }

    #[test]
    fn test_load_signing_config_defaults_to_interactive_oidc() {
        let _lock = env_lock().lock().expect("acquire env lock");
        clear_signing_env();

        let config = load_signing_config().expect("load signing config");

        assert!(matches!(
            config.mode,
            SigningMode::InteractiveOidc { force_oob: false }
        ));
    }

    #[test]
    fn test_fixture_sign_and_verify_round_trip_reports_signer_details() {
        let config = fixture_signing_config("alice@example.com", "https://issuer.example");
        let signature = sign_commit_payload_with_config(b"payload", &config).expect("sign payload");

        let verified = verify_commit_payload_with_config(
            b"payload",
            &signature,
            &permissive_verification_config(),
        )
        .expect("verify payload");

        assert_eq!(verified.identity, "alice@example.com");
        assert_eq!(verified.issuer.as_deref(), Some("https://issuer.example"));
        assert_eq!(verified.scheme, "ECDSA_P256_SHA256_ASN1");
        assert!(!verified.key_id.is_empty());
    }

    #[test]
    fn test_verify_rejects_payload_tampering() {
        let config = fixture_signing_config("alice@example.com", "https://issuer.example");
        let signature = sign_commit_payload_with_config(b"payload", &config).expect("sign payload");

        let err = verify_commit_payload_with_config(
            b"tampered",
            &signature,
            &permissive_verification_config(),
        )
        .expect_err("tampering should fail");

        assert!(err.to_string().contains("Sigstore operation failed"));
    }

    #[test]
    fn test_verify_rejects_untrusted_identity() {
        let config = fixture_signing_config("alice@example.com", "https://issuer.example");
        let signature = sign_commit_payload_with_config(b"payload", &config).expect("sign payload");
        let verification = VerificationConfig {
            identity_regexp: Regex::new("^bob@").expect("identity regex"),
            issuer_regexp: Regex::new(".*").expect("issuer regex"),
        };

        let err = verify_commit_payload_with_config(b"payload", &signature, &verification)
            .expect_err("identity policy should fail");
        assert!(err.to_string().contains("does not match"));
    }

    #[test]
    fn test_sign_commit_payload_uses_fixture_env_configuration() {
        let _lock = env_lock().lock().expect("acquire env lock");
        clear_signing_env();

        let config = fixture_signing_config("env@example.com", "https://issuer.example");
        let SigningMode::Fixture {
            certificate_pem,
            private_key_pem,
            ..
        } = config.mode.clone()
        else {
            panic!("expected fixture config");
        };

        let key_path = std::env::temp_dir().join(format!(
            "lapis-sigstore-fixture-key-{}.pem",
            std::process::id()
        ));
        fs::write(&key_path, &private_key_pem).expect("write key file");

        std::env::set_var("LAPIS_SIGSTORE_FIXTURE_CERT_PEM", &certificate_pem);
        std::env::set_var("LAPIS_SIGSTORE_FIXTURE_PRIVATE_KEY", &key_path);

        let signature = sign_commit_payload(b"payload").expect("sign payload");
        let verified = verify_commit_payload(b"payload", &signature).expect("verify payload");

        clear_signing_env();
        let _ = fs::remove_file(&key_path);

        assert_eq!(verified.identity, "env@example.com");
        assert_eq!(verified.issuer.as_deref(), Some("https://issuer.example"));
    }
}
