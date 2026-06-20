import { DiscordEmbed } from "@/types/embed";

export interface StarboardConfig {
    id: string; // BIGSERIAL returned as string in JS
    guild_id: string;
    starboard_channel_id: string;
    emojis: string[];
    reaction_threshold: number;
    min_message_age: string | null; // e.g. "1 day" or PG interval
    max_message_age: string | null;
    prevent_self_star: boolean;
    allow_bot_messages: boolean;
    keep_deleted_messages: boolean;
    role_restriction_type: 'none' | 'all_except' | 'only_these';
    restricted_roles: string[];
    channel_restriction_type: 'none' | 'all_except' | 'only_these';
    restricted_channels: string[];
    created_at?: Date;
    updated_at?: Date;
    embed_template: DiscordEmbed;
    plaintext_template: string;
}

export type StarboardConfigInput = Omit<Partial<StarboardConfig>, 'guild_id'>;