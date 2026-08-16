interface Option {
    value: string;
    label: string;
}

export function getAvailableRoleOptions(
    roleMap: Record<string, string> | null | undefined,
    scopeRoles?: string[]
): Option[] {
    const roles = scopeRoles ?? [];
    const map = roleMap ?? {};

    return Object.entries(map)
        .filter(([id]) => !roles.includes(id))
        .map(([id, name]) => ({
            value: id,
            label: `@${name.replace("@", "")}`
        }));
}

export function getAvailableChannelOptions(
    channelMap: Record<string, string> | null | undefined,
    scopeChannels?: string[]
): Option[] {
    const channels = scopeChannels ?? [];
    const map = channelMap ?? {};

    return Object.entries(map)
        .filter(([id]) => !channels.includes(id))
        .map(([id, name]) => ({
            value: id,
            label: `#${name.replace("#", "")}`
        }));
}

export function getAvailableCategoryOptions(
    categoryMap: Record<string, string> | null | undefined,
    scopeCategories?: string[]
): Option[] {
    const categories = scopeCategories ?? [];
    const map = categoryMap ?? {};

    return Object.entries(map)
        .filter(([id]) => !categories.includes(id))
        .map(([id, name]) => ({
            value: id,
            label: name
        }));
}