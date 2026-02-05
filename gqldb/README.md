# gqldb

GraphQL-native database implemented in Rust, with Python and TypeScript SDKs.

## 5-minute quickstart

```bash
cd gqldb
cargo run -p gqldb-server
```

In another terminal:

```bash
curl -X POST http://127.0.0.1:8080/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"query { health }"}'
```

## Structure

- `crates/`: core Rust crates
- `sdk/python`: Python SDK
- `sdk/typescript`: TypeScript SDK
- `examples/`: usage examples
- `docs/`: architecture and SDK docs

## Commands

```bash
# Rust
cargo test

# Python SDK
cd sdk/python
python -m pytest

# TypeScript SDK
cd sdk/typescript
npm run build
npm run test
```
