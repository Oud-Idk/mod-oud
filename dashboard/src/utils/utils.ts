interface RoleOption {
    value: string;
    label: string;
}

export function getAvailableRoleOptions(
    roleMap: Record<string, string> | null | undefined,
    scopeRoles: string[] | null | undefined
): RoleOption[] {
    const roles = scopeRoles || [];
    const map = roleMap || {};

    return Object.entries(map)
        .filter(([id]) => !roles.includes(id))
        .map(([id, name]) => ({
            value: id,
            label: `@${name.replace("@", "")}`
        }));
}

