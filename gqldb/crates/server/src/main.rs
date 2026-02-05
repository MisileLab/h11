use async_graphql::dynamic::{Field, FieldFuture, FieldValue, InputValue, Object, Schema, TypeRef, ValueAccessor};
use async_graphql::{Name, Value};
use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use axum::extract::State;
use axum::routing::get;
use axum::Router;
use axum::{response::Html, response::sse, response::sse::Event};
use gqldb_core::{Database, DatabaseConfig, RuntimeMode};
use gqldb_executor::Executor;
use gqldb_schema::{Field as SchemaField, Model, Schema as DbSchema};
use serde_json::Value as JsonValue;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;

#[derive(Clone)]
struct AppState {
    schema: DbSchema,
    executor: Arc<Mutex<Executor>>,
    graphql: Schema,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter("gqldb=debug")
        .init();

    let sample_schema = r#"
        type Query {
            health: String!
        }

        type User @shardKey(fields: ["id"]) {
            id: ID! @id
            name: String!
            email: String! @unique
            updatedAt: String @updatedAt
            embedding: [Float!] @vector(dim: 3, metric: "cosine")
        }
    "#;
    let schema = DbSchema::parse(sample_schema)?;
    let database = Database::new(
        schema.clone(),
        DatabaseConfig {
            mode: RuntimeMode::Server,
            data_dir: None,
            nodes: Vec::new(),
        },
    )?;
    let executor = Arc::new(Mutex::new(database.executor));
    let app_schema = build_schema(schema.clone(), executor.clone())?;

    let state = AppState {
        schema,
        executor,
        graphql: app_schema.clone(),
    };

    let app = Router::new()
        .route("/graphql", get(graphql_playground).post(graphql_handler))
        .route("/changes", get(changes_stream))
        .with_state(state)
        .layer(tower_http::cors::CorsLayer::permissive())
        .layer(tower_http::trace::TraceLayer::new_for_http());

    let addr = SocketAddr::from(([127, 0, 0, 1], 8080));
    tracing::info!("gqldb server listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app.into_make_service()).await?;
    Ok(())
}

async fn graphql_handler(
    State(state): State<AppState>,
    request: GraphQLRequest,
) -> GraphQLResponse {
    let response = state.graphql.execute(request.into_inner()).await;
    GraphQLResponse::from(response)
}

async fn graphql_playground() -> Html<String> {
    Html(async_graphql::http::playground_source(
        async_graphql::http::GraphQLPlaygroundConfig::new("/graphql"),
    ))
}

async fn changes_stream(State(state): State<AppState>) -> sse::Sse<impl tokio_stream::Stream<Item = Result<Event, std::convert::Infallible>>> {
    let receiver = state.executor.lock().unwrap().storage_subscribe();
    let stream = BroadcastStream::new(receiver).filter_map(|event| event.ok());
    let mapped = stream.map(|event| {
        let payload = format!("{}:{}", event.model, event.id);
        Ok(Event::default().data(payload))
    });
    sse::Sse::new(mapped)
}

fn build_schema(schema: DbSchema, executor: Arc<Mutex<Executor>>) -> anyhow::Result<Schema> {
    let mut query = Object::new("Query");
    query = query.field(Field::new("health", TypeRef::named_nn("String"), move |_| {
        FieldFuture::new(async move { Ok(Some(FieldValue::value("ok"))) })
    }));
    query = query.field(Field::new(
        "schemaVersion",
        TypeRef::named_nn("String"),
        {
            let version = schema.version.to_string();
            move |_| {
                let version = version.clone();
                FieldFuture::new(async move { Ok(Some(FieldValue::value(version))) })
            }
        },
    ));

    query = query.field(Field::new(
        "explain",
        TypeRef::named_nn("String"),
        move |_| FieldFuture::new(async move { Ok(Some(FieldValue::value("plan unavailable"))) }),
    ));

    let mut mutation = Object::new("Mutation");
    let mut objects = Vec::new();

    for model in schema.types.values() {
        if model.name == "Query" || model.name == "Mutation" || model.name == "Subscription" {
            continue;
        }
        objects.push(build_object(model.clone()));
        query = register_query_fields(query, model.clone(), executor.clone());
        mutation = register_mutation_fields(mutation, model.clone(), executor.clone());
    }

    let mut builder = Schema::build(
        query.type_name(),
        Some(mutation.type_name()),
        None,
    )
    .register(query)
    .register(mutation)
    ;

    for object in objects {
        builder = builder.register(object);
    }

    let schema = builder.finish()?;
    Ok(schema)
}

fn build_object(model: Model) -> Object {
    let mut object = Object::new(model.name.clone());
    for field in &model.fields {
        let type_ref = type_ref_from_field(field);
        let field_name = field.name.clone();
        object = object.field(Field::new(field_name.clone(), type_ref, move |ctx| {
            let field_name = field_name.clone();
            FieldFuture::new(async move {
                let record = ctx.parent_value.try_downcast_ref::<gqldb_storage::Record>().ok();
                if let Some(record) = record {
                    let value = record.data.get(&field_name);
                    return Ok(value.map(|value| FieldValue::value(json_to_value(value))));
                }
                Ok(None)
            })
        }));
    }
    object
}

fn register_query_fields(
    mut query: Object,
    model: Model,
    executor: Arc<Mutex<Executor>>,
) -> Object {
    let model_name = model.name.clone();
    let list_field = format!("list{}", model_name);
    let get_field = format!("get{}", model_name);
    let aggregate_field = format!("aggregate{}", model_name);
    let search_field = format!("search{}", model_name);

    let model_get = model.clone();
    let executor_get = executor.clone();

    query = query.field(
        Field::new(get_field, TypeRef::named(&model_name), move |ctx| {
            let model = model_get.clone();
            let executor = executor_get.clone();
            FieldFuture::new(async move {
                let id = ctx
                    .args
                    .get("id")
                    .and_then(|value| value.string().ok())
                    .unwrap_or("");
                let txn = executor.lock().unwrap().begin();
                let record = executor.lock().unwrap().get(&model, id, &txn);
                Ok(record.map(FieldValue::owned_any))
            })
        })
        .argument(InputValue::new("id", TypeRef::named_nn("ID"))),
    );

    let model_list = model.clone();
    let executor_list = executor.clone();
    query = query.field(
        Field::new(list_field, TypeRef::named_nn_list(&model_name), move |ctx| {
            let model = model_list.clone();
            let executor = executor_list.clone();
            FieldFuture::new(async move {
                let where_clause = parse_json_arg(ctx.args.get("where"));
                let order_by = parse_json_arg(ctx.args.get("orderBy"));
                let first = ctx
                    .args
                    .get("first")
                    .and_then(|value| value.i64().ok())
                    .map(|value| value as usize);
                let after = ctx
                    .args
                    .get("after")
                    .and_then(|value| value.string().ok());
                let txn = executor.lock().unwrap().begin();
                let records = executor
                    .lock()
                    .unwrap()
                    .list(&model, where_clause.as_ref(), order_by.as_ref(), first, after, &txn);
                Ok(Some(FieldValue::list(
                    records.into_iter().map(FieldValue::owned_any),
                )))
            })
        })
        .argument(InputValue::new("where", TypeRef::named("String")))
        .argument(InputValue::new("orderBy", TypeRef::named("String")))
        .argument(InputValue::new("first", TypeRef::named("Int")))
        .argument(InputValue::new("after", TypeRef::named("String"))),
    );

    let model_aggregate = model.clone();
    let executor_aggregate = executor.clone();
    query = query.field(
        Field::new(aggregate_field, TypeRef::named_nn("String"), move |ctx| {
            let model = model_aggregate.clone();
            let executor = executor_aggregate.clone();
            FieldFuture::new(async move {
                let where_clause = parse_json_arg(ctx.args.get("where"));
                let group_by = parse_json_arg(ctx.args.get("groupBy"));
                let txn = executor.lock().unwrap().begin();
                let aggregate = executor
                    .lock()
                    .unwrap()
                    .aggregate(&model, where_clause.as_ref(), group_by.as_ref(), &txn);
                Ok(Some(FieldValue::value(aggregate.to_string())))
            })
        })
        .argument(InputValue::new("where", TypeRef::named("String")))
        .argument(InputValue::new("groupBy", TypeRef::named("String"))),
    );

    let model_search = model.clone();
    let executor_search = executor.clone();
    query = query.field(
        Field::new(search_field, TypeRef::named_nn_list(&model_name), move |ctx| {
            let model = model_search.clone();
            let executor = executor_search.clone();
            FieldFuture::new(async move {
                let near = parse_json_arg(ctx.args.get("near")).unwrap_or(JsonValue::Null);
                let where_clause = parse_json_arg(ctx.args.get("where"));
                let txn = executor.lock().unwrap().begin();
                let records = executor
                    .lock()
                    .unwrap()
                    .search(&model, &near, where_clause.as_ref(), &txn);
                Ok(Some(FieldValue::list(
                    records.into_iter().map(FieldValue::owned_any),
                )))
            })
        })
        .argument(InputValue::new("near", TypeRef::named_nn("String")))
        .argument(InputValue::new("where", TypeRef::named("String"))),
    );

    query
}

fn register_mutation_fields(
    mut mutation: Object,
    model: Model,
    executor: Arc<Mutex<Executor>>,
) -> Object {
    let model_name = model.name.clone();
    let create_field = format!("create{}", model_name);
    let update_field = format!("update{}", model_name);
    let delete_field = format!("delete{}", model_name);
    let upsert_field = format!("upsert{}", model_name);

    let model_create = model.clone();
    let executor_create = executor.clone();

    mutation = mutation.field(
        Field::new(create_field, TypeRef::named(&model_name), move |ctx| {
            let model = model_create.clone();
            let executor = executor_create.clone();
            FieldFuture::new(async move {
                let input = parse_json_arg(ctx.args.get("input")).unwrap_or(JsonValue::Null);
                let txn = executor.lock().unwrap().begin();
                let record = executor.lock().unwrap().create(&model, &input, &txn).ok();
                Ok(record.map(FieldValue::owned_any))
            })
        })
        .argument(InputValue::new("input", TypeRef::named_nn("String"))),
    );

    let model_update = model.clone();
    let executor_update = executor.clone();
    mutation = mutation.field(
        Field::new(update_field, TypeRef::named(&model_name), move |ctx| {
            let model = model_update.clone();
            let executor = executor_update.clone();
            FieldFuture::new(async move {
                let id = ctx
                    .args
                    .get("id")
                    .and_then(|value| value.string().ok())
                    .unwrap_or("");
                let input = parse_json_arg(ctx.args.get("input")).unwrap_or(JsonValue::Null);
                let txn = executor.lock().unwrap().begin();
                let record = executor.lock().unwrap().update(&model, id, &input, &txn).ok();
                Ok(record.map(FieldValue::owned_any))
            })
        })
        .argument(InputValue::new("id", TypeRef::named_nn("ID")))
        .argument(InputValue::new("input", TypeRef::named_nn("String"))),
    );

    let model_delete = model.clone();
    let executor_delete = executor.clone();
    mutation = mutation.field(
        Field::new(delete_field, TypeRef::named(&model_name), move |ctx| {
            let model = model_delete.clone();
            let executor = executor_delete.clone();
            FieldFuture::new(async move {
                let id = ctx
                    .args
                    .get("id")
                    .and_then(|value| value.string().ok())
                    .unwrap_or("");
                let txn = executor.lock().unwrap().begin();
                let record = executor.lock().unwrap().delete(&model, id, &txn).ok();
                Ok(record.map(FieldValue::owned_any))
            })
        })
        .argument(InputValue::new("id", TypeRef::named_nn("ID"))),
    );

    let model_upsert = model.clone();
    let executor_upsert = executor.clone();
    mutation = mutation.field(
        Field::new(upsert_field, TypeRef::named(&model_name), move |ctx| {
            let model = model_upsert.clone();
            let executor = executor_upsert.clone();
            FieldFuture::new(async move {
                let id = ctx
                    .args
                    .get("id")
                    .and_then(|value| value.string().ok())
                    .unwrap_or("");
                let input = parse_json_arg(ctx.args.get("input")).unwrap_or(JsonValue::Null);
                let txn = executor.lock().unwrap().begin();
                let record = executor.lock().unwrap().upsert(&model, id, &input, &txn).ok();
                Ok(record.map(FieldValue::owned_any))
            })
        })
        .argument(InputValue::new("id", TypeRef::named_nn("ID")))
        .argument(InputValue::new("input", TypeRef::named_nn("String"))),
    );

    mutation
}

fn parse_json_arg(value: Option<ValueAccessor<'_>>) -> Option<JsonValue> {
    value
        .and_then(|value| value.string().ok())
        .and_then(|value| serde_json::from_str::<JsonValue>(value).ok())
}

fn json_to_value(value: &JsonValue) -> Value {
    match value {
        JsonValue::Null => Value::Null,
        JsonValue::Bool(value) => Value::Boolean(*value),
        JsonValue::Number(value) => {
            if let Some(value) = value.as_i64() {
                Value::Number(value.into())
            } else if let Some(value) = value.as_u64() {
                Value::Number((value as i64).into())
            } else if let Some(value) = value.as_f64() {
                Value::Number(serde_json::Number::from_f64(value).unwrap_or_else(|| 0.into()))
            } else {
                Value::Null
            }
        }
        JsonValue::String(value) => Value::String(value.clone()),
        JsonValue::Array(values) => {
            Value::List(values.iter().map(json_to_value).collect::<Vec<_>>())
        }
        JsonValue::Object(values) => Value::Object(
            values
                .iter()
                .map(|(key, value)| (Name::new(key.clone()), json_to_value(value)))
                .collect(),
        ),
    }
}

fn type_ref_from_field(field: &SchemaField) -> TypeRef {
    let base = field.field_type.name.as_str();
    if field.field_type.is_list {
        TypeRef::named_nn_list(base)
    } else if field.field_type.non_null {
        TypeRef::named_nn(base)
    } else {
        TypeRef::named(base)
    }
}
