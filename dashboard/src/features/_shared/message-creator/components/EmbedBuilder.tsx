import { EmbedState } from "@/features/_shared/message-creator/types";
import { DiscordEmbed, EmbedField } from "@/features/_shared/embed"; // <-- Removed FieldKey
import React, { ReactNode, SetStateAction, useMemo, useEffect } from "react";
import { PlaceholderList } from "@/features/_shared/message-creator/components/PlaceholderList";
import { EmbedBuilderForm } from "@/features/_shared/message-creator/components/EmbedBuilderForm";
import { EmbedPreview } from "@/features/_shared/message-creator/components/EmbedPreview";
import { BuilderConfig } from "@/features/_shared/builderConfig";

interface Props {
    config: BuilderConfig;
    setEmbedState: (state: object) => void;
    initialEmbedState?: string | object;
    enablePlaceholderList?: boolean;
    customPreview?: ReactNode;
    setIsEmpty: (value: SetStateAction<boolean>) => void;
    placeholderConfig?: BuilderConfig;
}

const emptyState: EmbedState = {
    title: "",
    description: "",
    color: "#ffffff",
    thumbnailUrl: "",
    imageUrl: "",
    authorName: "",
    authorIcon: "",
    footerText: "",
    footerIcon: "",
    fields: [],
};

// Pure helper function to map flat EmbedState to DiscordEmbed format
function convertToDiscordEmbed(embed: EmbedState): DiscordEmbed {
    return {
        title: embed.title || undefined,
        description: embed.description || undefined,
        color: hexToDecimal(embed.color),
        thumbnail: embed.thumbnailUrl ? { url: embed.thumbnailUrl } : undefined,
        author: embed.authorName ? {
            name: embed.authorName, icon_url: embed.authorIcon || undefined,
        } : undefined,
        footer: embed.footerText ? {
            text: embed.footerText, icon_url: embed.footerIcon || undefined,
        } : undefined,
        fields: embed.fields && embed.fields.length > 0 ? embed.fields.map(f => ({
            name: f.name || "\u200B",
            value: f.value || "\u200B",
            inline: f.inline || false
        })) : undefined,
        image: embed.imageUrl ? {
            url: embed.imageUrl
        } : undefined,
    };
}

export const hexToDecimal = (hex: string): number => {
    return parseInt(hex.replace("#", ""), 16);
};

function decimalToHex(decimal?: number): string {
    if (decimal === undefined || decimal === null) return "#000000"; // Default fallback color
    const clamped = Math.max(0, Math.min(decimal, 0xffffff));
    return `#${clamped.toString(16).padStart(6, '0')}`;
}

export function convertToEmbedState(embed: DiscordEmbed): EmbedState {
    return {
        title: embed.title || "",
        description: embed.description || "",
        color: decimalToHex(embed.color),
        thumbnailUrl: embed.thumbnail?.url || "",
        authorName: embed.author?.name || "",
        authorIcon: embed.author?.icon_url || "",
        footerText: embed.footer?.text || "",
        footerIcon: embed.footer?.icon_url || "",
        fields: embed.fields ? embed.fields.map(f => ({
            name: f.name === "\u200B" ? "" : f.name,
            value: f.value === "\u200B" ? "" : f.value,
            inline: f.inline || false
        })) : [],
        imageUrl: embed.image?.url || "",
    };
}

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

export default function EmbedBuilder({
    config,
    setEmbedState,
    initialEmbedState,
    enablePlaceholderList = true,
    customPreview: CustomPreview,
    setIsEmpty,
    placeholderConfig
}: Props) {
    const embed = useMemo<EmbedState>(() => {
        const parsed = parseSavedEmbed(initialEmbedState, emptyState);
        return { ...emptyState, ...parsed, fields: parsed.fields || [] };
    }, [initialEmbedState]);

    const isEmbedEmpty = useMemo(() => {
        return (
            !embed.title?.trim() &&
            !embed.description?.trim() &&
            (!embed.fields || embed.fields.length === 0) &&
            !embed.imageUrl &&
            !embed.authorName &&
            !embed.footerText
        );
    }, [embed]);

    useEffect(() => {
        setIsEmpty(isEmbedEmpty);
    }, [isEmbedEmpty, setIsEmpty]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        const updated = { ...embed, [name]: value };
        setEmbedState(convertToDiscordEmbed(updated));
    };

    // FIX 1: Use `keyof EmbedField` instead of `FieldKey` to match the exact properties in the array
    const handleFieldChange = (index: number, key: keyof EmbedField, value: string | boolean) => {
        const updatedFields = [...(embed.fields || [])];
        updatedFields[index] = { ...updatedFields[index], [key]: value };
        const updated = { ...embed, fields: updatedFields };
        setEmbedState(convertToDiscordEmbed(updated));
    };

    const addField = () => {
        const updated = {
            ...embed,
            fields: [...(embed.fields || []), { name: "", value: "", inline: false }],
        };
        setEmbedState(convertToDiscordEmbed(updated));
    };

    const removeField = (index: number) => {
        const updated = {
            ...embed,
            fields: (embed.fields || []).filter((_, i) => i !== index),
        };
        setEmbedState(convertToDiscordEmbed(updated));
    };

    // FIX 2: Added moveField support for the Up/Down arrows in EmbedBuilderForm
    const moveField = (fromIndex: number, toIndex: number) => {
        const updatedFields = [...(embed.fields || [])];
        const [movedItem] = updatedFields.splice(fromIndex, 1);
        updatedFields.splice(toIndex, 0, movedItem);

        const updated = { ...embed, fields: updatedFields };
        setEmbedState(convertToDiscordEmbed(updated));
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="flex flex-col space-y-4 pt-2">

                    {enablePlaceholderList && (placeholderConfig?.placeholders?.length ?? 0) > 0 && (
                        <PlaceholderList config={placeholderConfig || config} />
                    )}

                    <EmbedBuilderForm
                        embed={embed}
                        handleChange={handleChange}
                        handleFieldChange={handleFieldChange}
                        addField={addField}
                        removeField={removeField}
                        moveField={moveField}
                        isEmpty={isEmbedEmpty}
                    />
                </div>

                <div className="space-y-6">
                    {CustomPreview ? (
                        <>{CustomPreview}</>
                    ) : (
                        <EmbedPreview config={config} embed={embed}/>
                    )}
                </div>
            </div>
        </div>
    );
}