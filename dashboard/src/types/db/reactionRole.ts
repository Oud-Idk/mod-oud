import { DiscordEmbed } from "@/types/embed";
import { ButtonStyle, Format, ReactionRoleMode } from "@/types/db/index";

export interface ReactionRole {
    emoji: string;
    role_id: string;
}

export interface ButtonRole {
    role_id: string;
    custom_id: string;
    label?: string;
    style: ButtonStyle;
    emoji?: string;
}

export interface ReactionMessage {
    id: number;
    name: string;
    message_id?: string;
    channel_id: string;
    guild_id: string;
    format: Format;
    mode: ReactionRoleMode;
    embed: DiscordEmbed;
    content: string;
    reactions?: ReactionRole[];
    buttons?: ButtonRole[];
}