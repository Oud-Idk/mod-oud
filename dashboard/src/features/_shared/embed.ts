export type Format = "EMBED" | "TEXT";

// API Shape
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
    inline?: boolean;
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

export const isDeepEqual = (obj1: any, obj2: any): boolean => {
    if (obj1 === obj2) return true;

    const isEmpty = (val: any) => val === undefined || val === null || val === "";

    if (isEmpty(obj1) && isEmpty(obj2)) return true;

    if (typeof obj1 !== "object" || typeof obj2 !== "object" || obj1 == null || obj2 == null) {
        return false;
    }

    const keys1 = Object.keys(obj1).filter((k) => !isEmpty(obj1[k]));
    const keys2 = Object.keys(obj2).filter((k) => !isEmpty(obj2[k]));

    const hasColor1 = keys1.includes("color");
    const hasColor2 = keys2.includes("color");

    if (hasColor1 !== hasColor2) {
        if (hasColor1 && obj1.color === 0) {
            keys1.splice(keys1.indexOf("color"), 1);
        } else if (hasColor2 && obj2.color === 0) {
            keys2.splice(keys2.indexOf("color"), 1);
        }
    }

    if (keys1.length !== keys2.length) return false;

    for (const key of keys1) {
        if (!keys2.includes(key)) return false;
        if (!isDeepEqual(obj1[key], obj2[key])) return false;
    }

    return true;
};
