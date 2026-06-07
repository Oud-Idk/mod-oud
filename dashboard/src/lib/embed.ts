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
        };
    } catch (e) {
        return defaultValues || ({ color: "#000000" } as EmbedState);
    }
};