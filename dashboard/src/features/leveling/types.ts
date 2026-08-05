
import { DiscordEmbed, Format } from "@/features/_shared/embed";

export type NotificationScope = "CURRENT_CHANNEL" | "SPECIFIED_CHANNEL" | "DM" | "NONE";
export type TargetType = "CHANNEL" | "ROLE";
export type ScopeActionMode = "EXEMPT" | "ENFORCED";

export interface Scope {
    mode: ScopeActionMode;
    roles: string[];
    channels: string[];
}

export interface UserLevel {
    guild_id: string;
    user_id: string;
    cumulative_xp: number;
    current_level: number;
    current_xp: number;
    username: string;
}

export interface NotificationSettings {
    scope: NotificationScope;
    channelId?: string;
    format: Format;
    content: string;
    embed: DiscordEmbed;
}

export interface ImageCardSettings {
    textColor: string;
    barForegroundColor: string;
    barBackgroundColor: string;
    accentColor: string;
    lineSeparatorColor: string;
    usernameColor: string;
    statisticsColor: string;
    backgroundColor: string;
}

interface Range {
    min: number;
    max: number;
}

export interface TextSettings {
    enabled: boolean;
    xpCooldown: number;
    xpRange: Range;
    xpOnTickets: boolean;
}

export interface VoiceSettings {
    enabled: boolean;
    xpRange: Range;
}

export interface LevelingConfig {
    text: TextSettings;
    voice: VoiceSettings;
    scope: Scope;
    notify: NotificationSettings;
    imageCard: ImageCardSettings;

    levelCap: number;
    keepLevelOnLeave: boolean;
}

export interface XpMultiplier {
    guild_id: string;
    target_id: string;
    target_type: TargetType;
    multiplier: number;
}

export interface LevelReward {
    id: number;
    guild_id: string;
    level_requirement: number;
    roles_to_add: string[];
    remove_previous_roles: boolean;
}