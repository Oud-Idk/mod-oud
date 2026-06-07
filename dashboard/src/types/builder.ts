export interface EmbedField {
    name: string;
    value: string;
    inline?: boolean;
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
    fields?: EmbedField[]; // Added support for custom fields
}

export interface Placeholder {
    key: string;
    mockValue: string;
    label: string;
}

export interface BuilderConfig {
    id: string;
    name: string;
    description: string;
    accentColor?: string;
    placeholders: Placeholder[];
}