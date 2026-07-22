import { MessageFilteringConfig } from "@/types/db/config/messageFiltering";

export interface DiscordGuild {
    id: string;
    name: string;
    icon: string | null;
    permissions: string;
}

export interface GuildLists {
    mutualGuilds: DiscordGuild[];
    inviteableGuilds: DiscordGuild[];
}

export interface DiscordGuildDetails {
    id: string;
    name: string;
    icon: string | null;
    approximate_member_count?: number;
    approximate_presence_count?: number;
}


export interface DiscordChannel {
    id: string;
    name: string;
    type: number;
}

export function createFilterUpdater<K extends keyof MessageFilteringConfig>(
    config: MessageFilteringConfig,
    handleChange: (data: MessageFilteringConfig) => void,
    key: K
) {
    return (fields: Partial<MessageFilteringConfig[K]>) => {
        handleChange({
            ...config,
            [key]: {
                ...config[key],
                ...fields,
            },
        });
    };
}

export type ConnectingStatus = "CONNECTING" | "CONNECTED" | "DISCONNECTED";
export type VerificationStatus = 'IDLE' | 'VERIFYING' | 'SUCCESS' | 'ERROR';
export type TimeUnit = "MINUTES" | "HOURS" | "DAYS";
export type Status = "SUCCESS" | "ERROR";
export type FieldKey = "NAME" | "VALUE" | "INLINE";
export type IgnoredSelection = "IGNORED_CHANNELS" | "IGNORED_ROLES";
export type ScopeItem = "CHANNEL" | "ROLES";
export type ModerationAction = 'TIMEOUT' | 'KICK' | 'BAN' | 'ROLE_REMOVE' | 'ROLE_ADD' | 'ROLE_REMOVE_ALL';