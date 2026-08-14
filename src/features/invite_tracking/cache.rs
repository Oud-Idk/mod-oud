use serenity::all::RichInvite;
use std::collections::HashMap;

pub fn collect_pairs<'a>(
    invites: &'a [RichInvite],
) -> (
    Vec<(&'a str, u64)>,
    Vec<(&'a str, u64)>,
    HashMap<u64, Vec<&'a str>>,
) {
    let len = invites.len();
    let mut uses_items = Vec::with_capacity(len);
    let mut inviter_items = Vec::with_capacity(len);
    let mut codes_by_user: HashMap<u64, Vec<&'a str>> = HashMap::new();

    for inv in invites {
        let code = inv.code.as_str();
        uses_items.push((code, inv.uses));

        if let Some(u) = &inv.inviter {
            let user_id = u.id.get();
            inviter_items.push((code, user_id));
            codes_by_user.entry(user_id).or_default().push(code);
        }
    }

    (uses_items, inviter_items, codes_by_user)
}
