use crate::features::automod::{BaseRule, RuleAction, RuleScope};
use aho_corasick::AhoCorasick;
use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use serenity::all::GuildId;

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
    /// Unique ID of the ruleset.
    pub id: uuid::Uuid,
    /// Guild the ruleset belongs to.
    pub guild_id: GuildId,
    /// Display name of the ruleset.
    pub name: String,
    /// Whether the ruleset is active.
    pub enabled: bool,
    /// The patterns this ruleset matches against.
    pub patterns: Vec<Pattern>,
    /// Actions to take when a pattern matches.
    pub actions: Vec<RuleAction>,
    /// Timeout duration in seconds, if a timeout action is configured.
    pub timeout_duration_seconds: Option<i32>,
    /// Scope the ruleset applies to.
    pub scope: RuleScope,
}

impl BadWordRuleset {
    /// Converts the raw ruleset into a shared [`BaseRule`] for the automod pipeline.
    #[must_use]
    pub fn to_base_rule(&self) -> BaseRule {
        BaseRule {
            enabled: self.enabled,
            action: self.actions.clone(),
            scope: self.scope.clone(),
            timeout_duration_seconds: self.timeout_duration_seconds,
        }
    }
}

/// Metadata stored per pattern in the compiled Aho-Corasick engine
#[derive(Debug, Clone)]
pub struct CompiledPattern {
    /// Original unnormalized pattern text for triggering audit logs / verdicts
    pub original: String,
    /// Whether this pattern needs word-boundary checks or matches unconditionally
    pub strategy: MatchStrategy,
}

/// Pre-compiled, optimized structure kept in the L1 Moka cache
#[derive(Debug, Clone)]
pub struct CompiledRuleset {
    /// Unique ID of the ruleset.
    pub id: uuid::Uuid,
    /// Guild the ruleset belongs to.
    pub guild_id: GuildId,
    /// Display name of the ruleset.
    pub name: String,
    /// Whether the ruleset is active.
    pub enabled: bool,
    /// Actions to take when a pattern matches.
    pub actions: Vec<RuleAction>,
    /// Timeout duration in seconds, if a timeout action is configured.
    pub timeout_duration_seconds: Option<i32>,
    /// Scope the ruleset applies to.
    pub scope: RuleScope,

    /// Single-pass Aho-Corasick automaton handling BOTH exact and substring matches.
    /// Stores the automaton paired with pattern metadata ordered by pattern ID.
    pub text_matcher: Option<(AhoCorasick, Vec<CompiledPattern>)>,

    /// Pre-compiled regular expressions alongside their original raw strings
    pub regexes: Vec<(Regex, String)>,
}

impl CompiledRuleset {
    /// Converts the compiled ruleset into a shared [`BaseRule`] for the automod pipeline.
    #[must_use]
    pub fn to_base_rule(&self) -> BaseRule {
        BaseRule {
            enabled: self.enabled,
            action: self.actions.clone(),
            scope: self.scope.clone(),
            timeout_duration_seconds: self.timeout_duration_seconds,
        }
    }
}

impl From<BadWordRuleset> for CompiledRuleset {
    fn from(raw: BadWordRuleset) -> Self {
        let mut lower_text_patterns = Vec::new();
        let mut compiled_text_patterns = Vec::new();
        let mut regexes = Vec::new();

        for p in raw.patterns {
            match p.strategy {
                MatchStrategy::Exact => {
                    let normalized = p.value.to_lowercase().trim().to_string();
                    if !normalized.is_empty() {
                        lower_text_patterns.push(normalized);
                        compiled_text_patterns.push(CompiledPattern {
                            original: p.value,
                            strategy: MatchStrategy::Exact,
                        });
                    }
                }
                MatchStrategy::Substring => {
                    let normalized = p.value.to_lowercase();
                    if !normalized.is_empty() {
                        lower_text_patterns.push(normalized);
                        compiled_text_patterns.push(CompiledPattern {
                            original: p.value,
                            strategy: MatchStrategy::Substring,
                        });
                    }
                }
                MatchStrategy::Regex => {
                    if let Ok(re) = RegexBuilder::new(&p.value).case_insensitive(true).build() {
                        regexes.push((re, p.value));
                    }
                }
            }
        }

        let text_matcher = if lower_text_patterns.is_empty() {
            None
        } else {
            AhoCorasick::new(lower_text_patterns)
                .ok()
                .map(|ac| (ac, compiled_text_patterns))
        };

        Self {
            id: raw.id,
            guild_id: raw.guild_id,
            name: raw.name,
            enabled: raw.enabled,
            actions: raw.actions,
            timeout_duration_seconds: raw.timeout_duration_seconds,
            scope: raw.scope,
            text_matcher,
            regexes,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ruleset_with(patterns: Vec<Pattern>) -> BadWordRuleset {
        BadWordRuleset {
            id: uuid::Uuid::nil(),
            guild_id: GuildId::new(1),
            name: "test".to_string(),
            enabled: true,
            patterns,
            actions: Vec::new(),
            timeout_duration_seconds: None,
            scope: RuleScope::default(),
        }
    }

    fn pattern(strategy: MatchStrategy, value: &str) -> Pattern {
        Pattern {
            strategy,
            value: value.to_string(),
        }
    }

    #[test]
    fn combines_exact_and_substring_into_single_matcher() {
        let compiled: CompiledRuleset = ruleset_with(vec![
            pattern(MatchStrategy::Exact, "badword"),
            pattern(MatchStrategy::Substring, "sub"),
            pattern(MatchStrategy::Exact, "guaranteed returns"),
        ])
        .into();

        assert!(compiled.text_matcher.is_some());
        let (_, patterns) = compiled.text_matcher.unwrap();
        assert_eq!(patterns.len(), 3);
        assert_eq!(patterns[0].strategy, MatchStrategy::Exact);
        assert_eq!(patterns[1].strategy, MatchStrategy::Substring);
        assert_eq!(patterns[2].strategy, MatchStrategy::Exact);
    }

    #[test]
    fn drops_empty_or_whitespace_only_exact_patterns() {
        let compiled: CompiledRuleset = ruleset_with(vec![
            pattern(MatchStrategy::Exact, "   "),
            pattern(MatchStrategy::Exact, ""),
        ])
        .into();

        assert!(compiled.text_matcher.is_none());
    }
}
