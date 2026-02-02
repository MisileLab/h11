use graphql_parser::query::{parse_query, Definition, OperationDefinition, Selection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan {
    pub operations: Vec<PlannedOperation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlannedOperation {
    pub operation_type: OperationType,
    pub fields: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OperationType {
    Query,
    Mutation,
    Subscription,
}

pub fn plan_query(query: &str) -> anyhow::Result<Plan> {
    let document = parse_query::<String>(query)?;
    let mut operations = Vec::new();

    for definition in document.definitions {
        if let Definition::Operation(operation) = definition {
            let (operation_type, selections) = match operation {
                OperationDefinition::Query(query) => {
                    (OperationType::Query, query.selection_set.items)
                }
                OperationDefinition::Mutation(mutation) => {
                    (OperationType::Mutation, mutation.selection_set.items)
                }
                OperationDefinition::Subscription(subscription) => (
                    OperationType::Subscription,
                    subscription.selection_set.items,
                ),
                OperationDefinition::SelectionSet(selection_set) => {
                    (OperationType::Query, selection_set.items)
                }
            };

            let mut fields = Vec::new();
            for selection in selections {
                if let Selection::Field(field) = selection {
                    fields.push(field.name);
                }
            }

            operations.push(PlannedOperation {
                operation_type,
                fields,
            });
        }
    }

    Ok(Plan { operations })
}
