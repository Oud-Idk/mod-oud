"use client";

import React, { useEffect, useMemo, useState } from "react";
import { BuilderConfig, EmbedState } from "@/types/builder";
import { DiscordEmbed } from "@/types/embed";
import { hexToDecimal, parseSavedEmbed } from "@/lib/embedTemplates";
import { Embed } from "@/components/Embed/Embed";
import { EmbedBuilderForm } from "@/components/Embed/EmbedBuilderForm";
import { PlaceholderList } from "@/components/Embed/PlaceholderList";

interface Props {
    config: BuilderConfig;
    setEmbedState: (state: object) => void;
    initialEmbedState?: string | object;
}

const emptyState: EmbedState = {
    title: "",
    description: "",
    color: "#2ecc71",
    thumbnailUrl: "",
    authorName: "",
    authorIcon: "",
    footerText: "",
    footerIcon: "",
    fields: [],
};

export default function GenericEmbedBuilder({
    config,
    setEmbedState,
    initialEmbedState,
}: Props) {
    const [embed, setEmbed] = useState<EmbedState>(() => {
        const parsed = parseSavedEmbed(initialEmbedState, emptyState);
        return { ...emptyState, ...parsed, fields: parsed.fields || [] };
    });

    useEffect(() => {
        const parsed = parseSavedEmbed(initialEmbedState, emptyState);
        setEmbed({ ...emptyState, ...parsed, fields: parsed.fields || [] });
    }, [initialEmbedState]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setEmbed((prev) => ({ ...prev, [name]: value }));
    };

    const handleFieldChange = (index: number, key: "name" | "value" | "inline", value: string | boolean) => {
        setEmbed((prev) => {
            const updatedFields = [...(prev.fields || [])];
            updatedFields[index] = { ...updatedFields[index], [key]: value };
            return { ...prev, fields: updatedFields };
        });
    };

    const addField = () => {
        setEmbed((prev) => ({
            ...prev,
            fields: [...(prev.fields || []), { name: "", value: "", inline: false }],
        }));
    };

    const removeField = (index: number) => {
        setEmbed((prev) => ({
            ...prev,
            fields: (prev.fields || []).filter((_, i) => i !== index),
        }));
    };

    const generatedJson = useMemo<DiscordEmbed>(() => {
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
        };
    }, [embed]);

    useEffect(() => {
        setEmbedState(generatedJson);
    }, [generatedJson, setEmbedState]);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="flex flex-col space-y-6">
                    <PlaceholderList config={config}/>
                    <EmbedBuilderForm
                        embed={embed}
                        handleChange={handleChange}
                        handleFieldChange={handleFieldChange}
                        addField={addField}
                        removeField={removeField}
                    />
                </div>

                <div className="space-y-6">
                    <Embed config={config} embed={embed}/>
                </div>
            </div>
        </div>
    );
}