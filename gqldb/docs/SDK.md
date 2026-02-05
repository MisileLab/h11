# SDKs

## Python
The Python SDK is in `gqldb/sdk/python` and provides a minimal GraphQL HTTP client.

## TypeScript
The TypeScript SDK is in `gqldb/sdk/typescript` and provides a fetch-based client.

## Release Process
1. Update version numbers in `sdk/python/pyproject.toml` and `sdk/typescript/package.json`.
2. Run SDK tests from the gqldb root.
3. Publish artifacts to your package registries.
