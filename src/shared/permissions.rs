use serenity::all::{Member, PartialMember, RoleId};

/// Extension trait providing permission and role check helpers for Serenity member types.
pub trait HasRoles {
    /// Returns `true` if the member possesses at least one of the target `RoleId`s.
    fn has_any_role(&self, target_role_ids: &[RoleId]) -> bool;

    /// Returns `true` if the member possesses at least one of the target role IDs represented as strings.
    fn has_any_role_str<S: AsRef<str>>(&self, target_role_strs: &[S]) -> bool;

    /// Returns `true` if the member possesses at least one of the target role IDs represented as raw `u64` integers.
    fn has_any_role_u64(&self, target_role_ids: &[u64]) -> bool;
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
}
