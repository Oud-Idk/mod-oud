use crate::features::automod::{BaseRule, RuleAction, RuleScope};
use aho_corasick::AhoCorasick;
use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MatchStrategy {
    Exact,
    Substring,
    Regex,
}

/// Raw database / Redis pattern representation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pattern {
    pub strategy: MatchStrategy,
    pub value: String,
}

/// Raw database / Redis ruleset representation
#[derive(Debug, Clone, Serialize, Deserialize)]
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
    pub fn to_base_rule(&self) -> BaseRule {
        BaseRule {
            enabled: self.enabled,
            action: self.actions.clone(),
            scope: self.scope.clone(),
            timeout_duration_seconds: self.timeout_duration_seconds.map(|t| t as u64),
        }
    }
}

/// Pre-compiled, optimized structure kept in the L1 Moka cache
#[derive(Debug, Clone)]
pub struct CompiledRuleset {
    pub id: uuid::Uuid,
    pub guild_id: i64,
    pub name: String,
    pub enabled: bool,
    pub actions: Vec<RuleAction>,
    pub timeout_duration_seconds: Option<i32>,
    pub scope: RuleScope,

    /// Lowercased exact words for O(1) hashset lookup
    pub exact_words: HashSet<String>,

    /// Single-pass Aho-Corasick automaton for all substring patterns
    /// Stores the automaton and the original pattern values by index
    pub substring_matcher: Option<(AhoCorasick, Vec<String>)>,

    /// Pre-compiled regular expressions alongside their original raw strings
    pub regexes: Vec<(Regex, String)>,
}

impl CompiledRuleset {
    pub fn to_base_rule(&self) -> BaseRule {
        BaseRule {
            enabled: self.enabled,
            action: self.actions.clone(),
            scope: self.scope.clone(),
            timeout_duration_seconds: self.timeout_duration_seconds.map(|t| t as u64),
        }
    }
}

impl From<BadWordRuleset> for CompiledRuleset {
    fn from(raw: BadWordRuleset) -> Self {
        let mut exact_words = HashSet::new();
        let mut sub_patterns = Vec::new();
        let mut regexes = Vec::new();

        for p in raw.patterns {
            match p.strategy {
                MatchStrategy::Exact => {
                    exact_words.insert(p.value.to_lowercase());
                }
                MatchStrategy::Substring => {
                    sub_patterns.push(p.value);
                }
                MatchStrategy::Regex => {
                    if let Ok(re) = RegexBuilder::new(&p.value).case_insensitive(true).build() {
                        regexes.push((re, p.value));
                    }
                }
            }
        }

        let substring_matcher = if sub_patterns.is_empty() {
            None
        } else {
            // Build lowercased patterns for Aho-Corasick matching
            let lower_sub_patterns: Vec<String> =
                sub_patterns.iter().map(|s| s.to_lowercase()).collect();
            AhoCorasick::new(lower_sub_patterns)
                .ok()
                .map(|ac| (ac, sub_patterns))
        };

        Self {
            id: raw.id,
            guild_id: raw.guild_id,
            name: raw.name,
            enabled: raw.enabled,
            actions: raw.actions,
            timeout_duration_seconds: raw.timeout_duration_seconds,
            scope: raw.scope,
            exact_words,
            substring_matcher,
            regexes,
        }
    }
}
