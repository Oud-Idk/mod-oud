import { EmbedState } from "@/features/_shared/message-creator/types";
import { DiscordEmbed, DiscordEmbedSchema, EmbedField, isEmbedEmpty } from "@/features/_shared/embed";
import React, { ReactNode, useMemo, JSX } from "react";
import { PlaceholderList } from "@/features/_shared/message-creator/components/PlaceholderList";
import { EmbedBuilderForm } from "@/features/_shared/message-creator/components/EmbedBuilderForm";
import { EmbedPreview } from "@/features/_shared/message-creator/components/EmbedPreview";
import { BuilderConfig } from "@/features/_shared/builderConfig";

interface EmbedBuilderProps {
    config: BuilderConfig;
    setEmbedState: (state: object) => void;
    initialEmbedState?: string | object;
    enablePlaceholderList?: boolean;
    customPreview?: ReactNode;
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
        title: embed.title.length > 0 ? embed.title : undefined,
        description: embed.description.length > 0 ? embed.description : undefined,
        color: hexToDecimal(embed.color),
        thumbnail: embed.thumbnailUrl.length > 0 ? { url: embed.thumbnailUrl } : undefined,
        author: embed.authorName.length > 0 ? {
            name: embed.authorName,
            icon_url: embed.authorIcon.length > 0 ? embed.authorIcon : undefined,
        } : undefined,
        footer: embed.footerText.length > 0 ? {
            text: embed.footerText,
            icon_url: embed.footerIcon.length > 0 ? embed.footerIcon : undefined,
        } : undefined,
        fields: embed.fields.length > 0 ? embed.fields.map(f => ({
            name: f.name.length > 0 ? f.name : "\u200B",
            value: f.value.length > 0 ? f.value : "\u200B",
            inline: f.inline ?? false,
        })) : undefined,
        image: embed.imageUrl.length > 0 ? {
            url: embed.imageUrl,
        } : undefined,
    };
}

export const hexToDecimal = (hex: string): number => {
    return parseInt(hex.replace("#", ""), 16);
};

function decimalToHex(decimal?: number): string {
    if (decimal === undefined) return "#000000"; // Default fallback color
    const clamped = Math.max(0, Math.min(decimal, 0xffffff));
    return `#${clamped.toString(16).padStart(6, '0')}`;
}

export function convertToEmbedState(embed: DiscordEmbed): EmbedState {
    return {
        title: embed.title ?? "",
        description: embed.description ?? "",
        color: decimalToHex(embed.color),
        thumbnailUrl: embed.thumbnail?.url ?? "",
        authorName: embed.author?.name ?? "",
        authorIcon: embed.author?.icon_url ?? "",
        footerText: embed.footer?.text ?? "",
        footerIcon: embed.footer?.icon_url ?? "",
        fields: embed.fields !== undefined ? embed.fields.map(f => ({
            name: f.name === "\u200B" ? "" : f.name,
            value: f.value === "\u200B" ? "" : f.value,
            inline: f.inline ?? false,
        })) : [],
        imageUrl: embed.image?.url ?? "",
    };
}

export const parseSavedEmbed = (
    savedValue?: string | DiscordEmbed,
    defaultValues: EmbedState = emptyState
): EmbedState => {
    if (savedValue === undefined || savedValue === "") return defaultValues;

    try {
        const raw: unknown = typeof savedValue === "string"
            ? JSON.parse(savedValue)
            : savedValue;

        const parseResult = DiscordEmbedSchema.safeParse(raw);
        if (!parseResult.success) {
            return defaultValues;
        }

        return convertToEmbedState(parseResult.data);
    } catch {
        return defaultValues;
    }
};

export default function EmbedBuilder({
    config,
    setEmbedState,
    initialEmbedState,
    enablePlaceholderList = true,
    customPreview: CustomPreview,
    placeholderConfig,
}: EmbedBuilderProps): JSX.Element {
    const embed = useMemo<EmbedState>(() => {
        const parsed = parseSavedEmbed(initialEmbedState, emptyState);
        return { ...emptyState, ...parsed };
    }, [initialEmbedState]);

    const isEmbedEmptyMemo = useMemo(() => {
        return isEmbedEmpty(convertToDiscordEmbed(embed));
    }, [embed]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
        const { name, value } = e.target;
        const updated = { ...embed, [name]: value };
        setEmbedState(convertToDiscordEmbed(updated));
    };

    const handleColorChange = (color: string): void => {
        const updated = {...embed, color};
        setEmbedState(convertToDiscordEmbed(updated));
    }

    const handleFieldChange = (index: number, key: keyof EmbedField, value: string | boolean): void => {
        const updatedFields = [...embed.fields];
        updatedFields[index] = { ...updatedFields[index], [key]: value };
        const updated = { ...embed, fields: updatedFields };
        setEmbedState(convertToDiscordEmbed(updated));
    };

    const addField = (): void => {
        const updated = {
            ...embed,
            fields: [...embed.fields, { name: "", value: "", inline: false }],
        };
        setEmbedState(convertToDiscordEmbed(updated));
    };

    const removeField = (index: number): void => {
        const updated = {
            ...embed,
            fields: embed.fields.filter((_, i) => i !== index),
        };
        setEmbedState(convertToDiscordEmbed(updated));
    };

    const moveField = (fromIndex: number, toIndex: number): void => {
        const updatedFields = [...embed.fields];
        const [movedItem] = updatedFields.splice(fromIndex, 1);
        updatedFields.splice(toIndex, 0, movedItem);

        const updated = { ...embed, fields: updatedFields };
        setEmbedState(convertToDiscordEmbed(updated));
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="flex flex-col space-y-4 pt-2">

                    {enablePlaceholderList && (placeholderConfig?.placeholders.length ?? 0) > 0 && (
                        <PlaceholderList config={placeholderConfig ?? config} />
                    )}

                    <EmbedBuilderForm
                        embed={embed}
                        handleChange={handleChange}
                        handleFieldChange={handleFieldChange}
                        addField={addField}
                        removeField={removeField}
                        moveField={moveField}
                        isEmpty={isEmbedEmptyMemo}
                        handleColorChange={handleColorChange}
                    />
                </div>

                <div className="space-y-6">
                    {CustomPreview !== undefined && CustomPreview !== null ? (
                        <>{CustomPreview}</>
                    ) : (
                        <EmbedPreview config={config} embed={embed} />
                    )}
                </div>
            </div>
        </div>
    );
}