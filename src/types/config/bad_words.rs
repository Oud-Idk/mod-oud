use crate::types::config::message_filter::{BaseRule, Pattern, RuleAction, RuleScope};
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, Debug)]
pub struct BadWordRuleset {
    pub id: uuid::Uuid,
    pub guild_id: String,
    pub name: String,
    pub enabled: bool,
    pub patterns: Vec<Pattern>,
    pub actions: Vec<RuleAction>,
    pub timeout_duration_seconds: Option<i32>,
    pub scope: RuleScope,
}

impl BadWordRuleset {
    /// Maps our dynamic ruleset properties into a standard BaseRule structure
    pub fn to_base_rule(&self) -> BaseRule {
        BaseRule {
            enabled: self.enabled,
            action: self.actions.clone(),
            scope: self.scope.clone(),
            timeout_duration_seconds: self.timeout_duration_seconds.map(|t| t as u64),
        }
    }
}