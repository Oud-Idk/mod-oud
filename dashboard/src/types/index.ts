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
    approximate_member_count?: number; // Total Member Count
    approximate_presence_count?: number; // Online/Active Member Count
}

export interface WelcomeConfig {
    enabled: boolean;
    channel_id: string;
    content: string;
    embed: string;
    format: string;
}

export interface Config {
    welcome: WelcomeConfig;
}

export interface DiscordChannel {
    id: string;
    name: string;
    type: number;
}