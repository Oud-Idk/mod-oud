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

export interface PublicWelcomeConfig {
    enabled: boolean;
    channel_id: string;
    content: string; // Public message text (e.g., "Welcome to the server, {user}!")
    embed: string;   // Public embed JSON
    format: string;
}

export interface PrivateWelcomeConfig {
    enabled: boolean;
    content: string; // Private message text (e.g., "Thanks for joining! Here are the rules...")
    embed: string;   // Private embed JSON
    format: string;
}

export interface WelcomeConfig {
    public: PublicWelcomeConfig;
    private: PrivateWelcomeConfig;
}

export interface Config {
    welcome: WelcomeConfig;
}

export interface DiscordChannel {
    id: string;
    name: string;
    type: number;
}