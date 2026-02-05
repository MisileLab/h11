use graphql_parser::schema::{
    parse_schema, Definition, Directive, ObjectType, Type, TypeDefinition, Value,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum SchemaError {
    #[error("schema parse error: {0}")]
    Parse(String),
    #[error("missing query type")]
    MissingQueryType,
    #[error("invalid directive: {0}")]
    InvalidDirective(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Schema {
    pub version: Uuid,
    pub types: HashMap<String, Model>,
    pub directives: Vec<DirectiveSpec>,
}

impl Schema {
    pub fn parse(sdl: &str) -> Result<Self, SchemaError> {
        let document =
            parse_schema::<String>(sdl).map_err(|err| SchemaError::Parse(err.to_string()))?;
        let mut types = HashMap::new();
        let mut directives = Vec::new();

        for definition in document.definitions {
            match definition {
                Definition::TypeDefinition(TypeDefinition::Object(object)) => {
                    let model = Model::from_object(&object)?;
                    types.insert(model.name.clone(), model);
                }
                Definition::DirectiveDefinition(def) => {
                    directives.push(DirectiveSpec::from_definition(&def));
                }
                _ => {}
            }
        }

        if !types.contains_key("Query") {
            return Err(SchemaError::MissingQueryType);
        }

        Ok(Self {
            version: Uuid::new_v4(),
            types,
            directives,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Model {
    pub name: String,
    pub fields: Vec<Field>,
    pub directives: Vec<DirectiveSpec>,
    pub shard_key: Vec<String>,
}

impl Model {
    fn from_object(object: &ObjectType<String>) -> Result<Self, SchemaError> {
        let directives = object
            .directives
            .iter()
            .map(DirectiveSpec::from_directive)
            .collect::<Result<Vec<_>, _>>()?;

        let shard_key = directives
            .iter()
            .find(|directive| directive.name == "shardKey")
            .and_then(|directive| directive.arguments.get("fields"))
            .and_then(DirectiveValue::as_string_list)
            .unwrap_or_default();

        let mut fields = Vec::new();
        for field in &object.fields {
            let directives = field
                .directives
                .iter()
                .map(DirectiveSpec::from_directive)
                .collect::<Result<Vec<_>, _>>()?;
            fields.push(Field::new(
                field.name.clone(),
                field.field_type.clone(),
                directives,
            ));
        }

        Ok(Self {
            name: object.name.clone(),
            fields,
            directives,
            shard_key,
        })
    }

    pub fn id_field(&self) -> Option<&Field> {
        self.fields.iter().find(|field| field.has_directive("id"))
    }

    pub fn unique_indexes(&self) -> Vec<IndexDefinition> {
        let mut indexes = Vec::new();
        for field in &self.fields {
            if field.has_directive("unique") {
                indexes.push(IndexDefinition {
                    name: format!("{}_{}_unique", self.name, field.name),
                    fields: vec![field.name.clone()],
                    unique: true,
                });
            }
        }
        for directive in &self.directives {
            if directive.name == "index" {
                if let Some(fields) = directive
                    .arguments
                    .get("fields")
                    .and_then(DirectiveValue::as_string_list)
                {
                    indexes.push(IndexDefinition {
                        name: directive
                            .arguments
                            .get("name")
                            .and_then(DirectiveValue::as_string)
                            .unwrap_or_else(|| format!("{}_idx", self.name)),
                        fields,
                        unique: false,
                    });
                }
            }
        }
        indexes
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Field {
    pub name: String,
    pub field_type: FieldType,
    pub directives: Vec<DirectiveSpec>,
}

impl Field {
    pub fn new(name: String, field_type: Type<String>, directives: Vec<DirectiveSpec>) -> Self {
        Self {
            name,
            field_type: FieldType::from_graphql_type(&field_type),
            directives,
        }
    }

    pub fn has_directive(&self, name: &str) -> bool {
        self.directives
            .iter()
            .any(|directive| directive.name == name)
    }

    pub fn relation(&self) -> Option<RelationDefinition> {
        self.directives
            .iter()
            .find(|directive| directive.name == "relation")
            .and_then(|directive| RelationDefinition::from_directive(directive).ok())
    }

    pub fn vector(&self) -> Option<VectorDefinition> {
        self.directives
            .iter()
            .find(|directive| directive.name == "vector")
            .and_then(|directive| VectorDefinition::from_directive(directive).ok())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectiveSpec {
    pub name: String,
    pub arguments: HashMap<String, DirectiveValue>,
}

impl DirectiveSpec {
    pub fn from_definition(def: &graphql_parser::schema::DirectiveDefinition<String>) -> Self {
        let mut arguments = HashMap::new();
        for argument in &def.arguments {
            arguments.insert(
                argument.name.clone(),
                DirectiveValue::String("".to_string()),
            );
        }
        Self {
            name: def.name.clone(),
            arguments,
        }
    }

    pub fn from_directive(directive: &Directive<String>) -> Result<Self, SchemaError> {
        let mut arguments = HashMap::new();
        for (name, value) in &directive.arguments {
            arguments.insert(name.clone(), DirectiveValue::from_value(value)?);
        }
        Ok(Self {
            name: directive.name.clone(),
            arguments,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value")]
pub enum DirectiveValue {
    String(String),
    Int(i64),
    Float(f64),
    Boolean(bool),
    List(Vec<DirectiveValue>),
}

impl DirectiveValue {
    fn from_value(value: &Value<String>) -> Result<Self, SchemaError> {
        match value {
            Value::String(value) => Ok(Self::String(value.clone())),
            Value::Int(value) => Ok(Self::Int(value.as_i64().unwrap_or_default())),
            Value::Float(value) => Ok(Self::Float(*value)),
            Value::Boolean(value) => Ok(Self::Boolean(*value)),
            Value::List(values) => Ok(Self::List(
                values
                    .iter()
                    .map(DirectiveValue::from_value)
                    .collect::<Result<Vec<_>, _>>()?,
            )),
            _ => Err(SchemaError::InvalidDirective(format!(
                "unsupported directive value: {value:?}"
            ))),
        }
    }

    pub fn as_string(&self) -> Option<String> {
        match self {
            DirectiveValue::String(value) => Some(value.clone()),
            _ => None,
        }
    }

    pub fn as_string_list(&self) -> Option<Vec<String>> {
        match self {
            DirectiveValue::List(values) => {
                let mut output = Vec::new();
                for value in values {
                    if let DirectiveValue::String(value) = value {
                        output.push(value.clone());
                    }
                }
                Some(output)
            }
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexDefinition {
    pub name: String,
    pub fields: Vec<String>,
    pub unique: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelationDefinition {
    pub name: String,
    pub fields: Vec<String>,
    pub references: Vec<String>,
}

impl RelationDefinition {
    pub fn from_directive(directive: &DirectiveSpec) -> Result<Self, SchemaError> {
        let fields = directive
            .arguments
            .get("fields")
            .and_then(DirectiveValue::as_string_list)
            .unwrap_or_default();
        let references = directive
            .arguments
            .get("references")
            .and_then(DirectiveValue::as_string_list)
            .unwrap_or_default();
        Ok(Self {
            name: directive
                .arguments
                .get("name")
                .and_then(DirectiveValue::as_string)
                .unwrap_or_else(|| "relation".to_string()),
            fields,
            references,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorDefinition {
    pub dim: usize,
    pub metric: String,
    pub index_type: Option<String>,
}

impl VectorDefinition {
    pub fn from_directive(directive: &DirectiveSpec) -> Result<Self, SchemaError> {
        let dim = directive
            .arguments
            .get("dim")
            .and_then(DirectiveValue::as_string)
            .and_then(|value| value.parse::<usize>().ok())
            .unwrap_or(0);
        let metric = directive
            .arguments
            .get("metric")
            .and_then(DirectiveValue::as_string)
            .unwrap_or_else(|| "cosine".to_string());
        let index_type = directive
            .arguments
            .get("indexType")
            .and_then(DirectiveValue::as_string);

        Ok(Self {
            dim,
            metric,
            index_type,
        })
    }
}

impl fmt::Display for DirectiveValue {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DirectiveValue::String(value) => write!(formatter, "{value}"),
            DirectiveValue::Int(value) => write!(formatter, "{value}"),
            DirectiveValue::Float(value) => write!(formatter, "{value}"),
            DirectiveValue::Boolean(value) => write!(formatter, "{value}"),
            DirectiveValue::List(values) => write!(formatter, "{:?}", values),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldType {
    pub name: String,
    pub is_list: bool,
    pub non_null: bool,
    pub inner_non_null: bool,
}

impl FieldType {
    pub fn from_graphql_type(field_type: &Type<String>) -> Self {
        match field_type {
            Type::NamedType(name) => Self {
                name: name.clone(),
                is_list: false,
                non_null: false,
                inner_non_null: false,
            },
            Type::NonNullType(inner) => match inner.as_ref() {
                Type::NamedType(name) => Self {
                    name: name.clone(),
                    is_list: false,
                    non_null: true,
                    inner_non_null: false,
                },
                Type::ListType(inner_list) => Self::from_list(inner_list, true),
                Type::NonNullType(inner) => Self::from_graphql_type(inner),
            },
            Type::ListType(inner) => Self::from_list(inner, false),
        }
    }

    fn from_list(inner: &Type<String>, non_null: bool) -> Self {
        match inner {
            Type::NamedType(name) => Self {
                name: name.clone(),
                is_list: true,
                non_null,
                inner_non_null: false,
            },
            Type::NonNullType(inner) => match inner.as_ref() {
                Type::NamedType(name) => Self {
                    name: name.clone(),
                    is_list: true,
                    non_null,
                    inner_non_null: true,
                },
                _ => Self {
                    name: "String".to_string(),
                    is_list: true,
                    non_null,
                    inner_non_null: true,
                },
            },
            _ => Self {
                name: "String".to_string(),
                is_list: true,
                non_null,
                inner_non_null: false,
            },
        }
    }
}
