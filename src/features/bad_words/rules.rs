use crate::features::automod::should_skip_scope;
use crate::features::bad_words::types::CompiledRuleset;
use serenity::all::Message;

pub fn should_be_skipped_ruleset(message: &Message, ruleset: &CompiledRuleset) -> bool {
    should_skip_scope(message, &ruleset.scope)
}
