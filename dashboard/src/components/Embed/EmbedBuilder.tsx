"use client";

import React, { ReactNode, SetStateAction, useMemo } from "react";
import { BuilderConfig, EmbedState } from "@/types/builder";
import { DiscordEmbed } from "@/types/embed";
import { Embed } from "@/components/Embed/Embed";
import { EmbedBuilderForm } from "@/components/Embed/EmbedBuilderForm";
import { PlaceholderList } from "@/components/Embed/PlaceholderList";
import { hexToDecimal, parseSavedEmbed } from "@/utils/embed";

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

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        const updated = { ...embed, [name]: value };
        setEmbedState(convertToDiscordEmbed(updated));
    };

    const handleFieldChange = (index: number, key: "name" | "value" | "inline", value: string | boolean) => {
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

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="flex flex-col space-y-4 pt-2">
                    {(enablePlaceholderList && (placeholderConfig?.placeholders.length || 0 > 0)) && (
                        <PlaceholderList config={config}/>)
                    }
                    <EmbedBuilderForm
                        embed={embed}
                        handleChange={handleChange}
                        handleFieldChange={handleFieldChange}
                        addField={addField}
                        removeField={removeField}
                        setIsEmpty={setIsEmpty}
                    />
                </div>

                <div className="space-y-6">
                    {CustomPreview ? (
                        <>{CustomPreview}</>
                    ) : (
                        <Embed config={config} embed={embed}/>
                    )}
                </div>
            </div>
        </div>
    );
}