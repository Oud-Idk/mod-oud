use serenity::all::Message;
use crate::features::automod::should_skip_scope;
use crate::features::bad_words::types::BadWordRuleset;

pub fn should_be_skipped_ruleset(message: &Message, ruleset: &BadWordRuleset) -> bool {
    should_skip_scope(message, &ruleset.scope)
}