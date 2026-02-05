use gqldb_schema::Schema;

#[test]
fn parses_directives() {
    let sdl = r#"
        type Query { health: String! }

        type User @shardKey(fields: ["id"]) {
            id: ID! @id
            email: String! @unique
            name: String!
            embedding: [Float!] @vector(dim: 3, metric: "cosine")
        }
    "#;
    let schema = Schema::parse(sdl).expect("schema parse");
    let user = schema.types.get("User").expect("User model");
    assert_eq!(user.name, "User");
    assert!(user.id_field().is_some());
    assert!(!user.shard_key.is_empty());
}
