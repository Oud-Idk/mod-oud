interface RoleOption {
    value: string;
    label: string;
}

export interface ChannelOption {
    value: string;
    label: string;
}

export function getAvailableRoleOptions(
    roleMap: Record<string, string> | null | undefined,
    scopeRoles?: string[]
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

export function getAvailableChannelOptions(
    channelMap: Record<string, string> | null | undefined,
    scopeChannels?: string[]
): ChannelOption[] {
    const channels = scopeChannels || [];
    const map = channelMap || {};

    return Object.entries(map)
        .filter(([id]) => !channels.includes(id))
        .map(([id, name]) => ({
            value: id,
            label: `#${name.replace("#", "")}`
        }));
}