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

export interface DiscordEmbed {
    title?: string;
    description?: string;
    color?: number; // Represented as a decimal number (result of hexToDecimal)
    thumbnail?: EmbedThumbnail;
    author?: EmbedAuthor;
    footer?: EmbedFooter;
}