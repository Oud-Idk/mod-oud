use serenity::all::RichInvite;

pub fn collect_pairs(invites: &[RichInvite]) -> (
    Vec<(&str, u64)>, Vec<(&str, u64)>, Vec<(u64, &str)>
) {
    let len = invites.len();

    let mut uses_items = Vec::with_capacity(len);
    let mut inviter_items = Vec::with_capacity(len);
    let mut codes_by_inviter_items = Vec::with_capacity(len);

    for inv in invites {
        let code = inv.code.as_str();

        uses_items.push((code, inv.uses));

        if let Some(u) = &inv.inviter {
            let user_id = u.id.get();
            inviter_items.push((code, user_id));
            codes_by_inviter_items.push((user_id, code));
        }
    }

    (uses_items, inviter_items, codes_by_inviter_items)
}