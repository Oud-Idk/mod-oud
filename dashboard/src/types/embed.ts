export interface EmbedThumbnail {
    url: string;
}

export interface EmbedAuthor {
    name: string;
    icon_url?: string;
}

export interface EmbedFooter {
    text: string;
    icon_url?: string;
}

export interface EmbedField {
    name: string;
    value: string;
    inline: boolean;
}

export interface DiscordEmbed {
    title?: string;
    description?: string;
    color?: number;
    thumbnail?: EmbedThumbnail;
    author?: EmbedAuthor;
    footer?: EmbedFooter;
    fields?: EmbedField[];
    image?: EmbedThumbnail;
}