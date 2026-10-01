use serenity::all::{GuildId, Member, PartialMember, Permissions, Role, RoleId, UserId};
use std::collections::HashMap;
use std::hash::BuildHasher;

/// The guild-wide permissions a member holds through their roles.
///
/// Channel overwrites are deliberately ignored. Slash commands declare
/// `default_member_permissions`, which Discord evaluates without overwrites, so a gate standing
/// in for one has to agree: checking a channel would let an overwrite on that channel grant a
/// permission the matching slash command would still refuse.
#[must_use]
pub fn guild_role_permissions<S: BuildHasher>(
    member: &Member,
    guild_id: GuildId,
    guild_roles: &HashMap<RoleId, Role, S>,
) -> Permissions {
    // Discord models the everyone role under the guild's own id.
    let mut permissions = guild_roles
        .get(&RoleId::new(guild_id.get()))
        .map_or_else(Permissions::empty, |role| role.permissions);

    for role_id in &member.roles {
        if let Some(role) = guild_roles.get(role_id) {
            permissions |= role.permissions;
        }
    }

    permissions
}

/// Returns whether `member` holds every permission in `required`.
///
/// The guild owner counts as holding all of them: Discord grants that to the owner, but a
/// role-derived permission set does not carry it. Any gate that runs on behalf of a user needs
/// this, or the owner is locked out of the action they are entitled to take.
#[must_use]
pub fn has_permissions<S: BuildHasher>(
    member: &Member,
    guild_id: GuildId,
    guild_owner_id: UserId,
    guild_roles: &HashMap<RoleId, Role, S>,
    required: Permissions,
) -> bool {
    member.user.id == guild_owner_id
        || guild_role_permissions(member, guild_id, guild_roles).contains(required)
}

/// Extension trait providing permission and role check helpers for Serenity member types.
pub trait HasRoles {
    /// Returns `true` if the member possesses at least one of the target `RoleId`s.
    fn has_any_role(&self, target_role_ids: &[RoleId]) -> bool;

    /// Returns `true` if the member possesses at least one of the target role IDs represented as strings.
    fn has_any_role_str<S: AsRef<str>>(&self, target_role_strs: &[S]) -> bool;

    /// Returns `true` if the member possesses at least one of the target role IDs represented as raw `u64` integers.
    fn has_any_role_u64(&self, target_role_ids: &[u64]) -> bool;

    /// Returns `true` if the member possesses at least one of the target role IDs represented as raw `i64` integers.
    fn has_any_role_i64(&self, target_role_ids: &[i64]) -> bool;
}

impl HasRoles for Member {
    fn has_any_role(&self, target_role_ids: &[RoleId]) -> bool {
        self.roles
            .iter()
            .any(|role_id| target_role_ids.contains(role_id))
    }

    fn has_any_role_str<S: AsRef<str>>(&self, target_role_strs: &[S]) -> bool {
        target_role_strs
            .iter()
            .filter_map(|s| s.as_ref().parse::<u64>().ok().map(RoleId::new))
            .any(|exempt_id| self.roles.contains(&exempt_id))
    }

    fn has_any_role_u64(&self, target_role_ids: &[u64]) -> bool {
        self.roles
            .iter()
            .any(|role_id| target_role_ids.contains(&role_id.get()))
    }

    fn has_any_role_i64(&self, target_role_ids: &[i64]) -> bool {
        self.roles
            .iter()
            .any(|role_id| target_role_ids.contains(&(role_id.get().cast_signed())))
    }
}

impl HasRoles for PartialMember {
    fn has_any_role(&self, target_role_ids: &[RoleId]) -> bool {
        self.roles
            .iter()
            .any(|role_id| target_role_ids.contains(role_id))
    }

    fn has_any_role_str<S: AsRef<str>>(&self, target_role_strs: &[S]) -> bool {
        target_role_strs
            .iter()
            .filter_map(|s| s.as_ref().parse::<u64>().ok().map(RoleId::new))
            .any(|exempt_id| self.roles.contains(&exempt_id))
    }

    fn has_any_role_u64(&self, target_role_ids: &[u64]) -> bool {
        self.roles
            .iter()
            .any(|role_id| target_role_ids.contains(&role_id.get()))
    }

    fn has_any_role_i64(&self, target_role_ids: &[i64]) -> bool {
        self.roles
            .iter()
            .any(|role_id| target_role_ids.contains(&(role_id.get().cast_signed())))
    }
}
