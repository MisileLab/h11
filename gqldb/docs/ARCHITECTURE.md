# gqldb Architecture

## Overview
gqldb is a GraphQL-native database implemented in Rust. The GraphQL schema is the single source of truth for data models, constraints, indexing, and sharding.

## Core Flow
1. SDL is parsed into a schema model.
2. GraphQL queries are planned into logical operations.
3. The executor runs CRUD, aggregate, and vector search with MVCC storage.
4. Server exposes HTTP and WebSocket GraphQL endpoints.
5. Cluster router shards and replicates writes and balances reads.

## Runtime Modes
- Memory: in-memory storage for development.
- File: append-only WAL file storage.
- Server: HTTP/WS GraphQL endpoint.
- Cluster: sharded routing with primary + replica nodes.
