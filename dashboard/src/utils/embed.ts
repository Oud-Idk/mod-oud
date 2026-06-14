import { EmbedState } from "@/types/builder";
import { DiscordEmbed } from "@/types/embed";

const decimalToHex = (decimal?: number): string => {
    if (decimal === undefined) return "#000000";
    const hex = decimal.toString(16);
    return "#" + hex.padStart(6, "0");
};
export const hexToDecimal = (hex: string): number => {
    return parseInt(hex.replace("#", ""), 16);
};
// Helper to parse existing database JSON or object back into the Builder state format
export const parseSavedEmbed = (savedValue?: string | object, defaultValues?: EmbedState): EmbedState => {
    if (!savedValue) return defaultValues || ({ color: "#000000" } as EmbedState);
    try {
        const parsed: DiscordEmbed = typeof savedValue === "string" ? JSON.parse(savedValue) : (savedValue as DiscordEmbed);

        return {
            title: parsed.title || "",
            description: parsed.description || "",
            color: decimalToHex(parsed.color),
            thumbnailUrl: parsed.thumbnail?.url || "",
            authorName: parsed.author?.name || "",
            authorIcon: parsed.author?.icon_url || "",
            footerText: parsed.footer?.text || "",
            footerIcon: parsed.footer?.icon_url || "",
            imageUrl: parsed.image?.url || "",
            fields: parsed.fields ? parsed.fields.map(f => ({
                name: f.name === "\u200B" ? "" : f.name,
                value: f.value === "\u200B" ? "" : f.value,
                inline: f.inline || false
            })) : [],
        };
    } catch (e) {
        return defaultValues || ({ color: "#000000" } as EmbedState);
    }
};

export const safeParseEmbed = (embedValue: unknown) => {
    if (!embedValue) return {};
    if (typeof embedValue === "string") {
        try {
            return JSON.parse(embedValue);
        } catch {
            return {};
        }
    }
    if (typeof embedValue === "object") {
        return embedValue;
    }
    return {};
};

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