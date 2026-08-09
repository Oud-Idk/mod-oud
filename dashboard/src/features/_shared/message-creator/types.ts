import { DiscordEmbed, EmbedField, Format } from "@/features/_shared/embed";

export interface GenericMessageConfig {
    enabled?: boolean;
    channel_id?: string | null;
    content?: string | null;
    embed?: DiscordEmbed;
    format: Format;
}

export interface EmbedState {
    title: string;
    description: string;
    color: string;
    authorName: string;
    authorIcon: string;
    footerText: string;
    footerIcon: string;
    imageUrl: string;
    thumbnailUrl: string;
    fields: EmbedField[];
}