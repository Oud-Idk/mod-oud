use std::sync::OnceLock;
use serde::{Deserialize, Serialize};
use regex::Regex;
use crate::features::automod::{BaseRule, RuleAction, RuleScope};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MatchStrategy {
    Exact,
    Substring,
    Regex,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pattern {
    pub strategy: MatchStrategy,
    pub value: String,

    #[serde(skip, default)]
    pub compiled_regex: OnceLock<Option<Regex>>,

    #[serde(skip, default)]
    pub lowercase_value: OnceLock<String>,
}

impl Clone for Pattern {
    fn clone(&self) -> Self {
        let re_cell = OnceLock::new();
        if let Some(cached_re) = self.compiled_regex.get() {
            let _ = re_cell.set(cached_re.clone());
        }

        let lower_cell = OnceLock::new();
        if let Some(cached_lower) = self.lowercase_value.get() {
            let _ = lower_cell.set(cached_lower.clone());
        }

        Self {
            strategy: self.strategy.clone(),
            value: self.value.clone(),
            compiled_regex: re_cell,
            lowercase_value: lower_cell,
        }
    }
}

#[derive(Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BadWordRuleset {
    pub id: uuid::Uuid,
    pub guild_id: i64,
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