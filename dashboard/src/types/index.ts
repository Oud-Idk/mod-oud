import { MessageFilteringConfig } from "@/types/config/messageFiltering";

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

export interface DeletedMessage {
    id: number;
    message_id: string;
    author_id: string;
    author_name: string;
    channel_id: string;
    guild_id: string;
    content: string;
    attachment_url: string;
    deleted_at: string;
}

export interface EditedMessage {
    id: number;
    message_id: string;
    author_id: string;
    author_name: string;
    channel_id: string;
    guild_id: string;
    old_content: string | null;
    new_content: string | null;
    updated_at: string;
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
