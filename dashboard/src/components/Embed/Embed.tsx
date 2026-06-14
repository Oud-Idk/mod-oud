import React from "react";
import {
    DiscordEmbed,
    DiscordEmbedDescription,
    DiscordEmbedField,
    DiscordEmbedFields,
    DiscordEmbedFooter,
    DiscordMessage,
    DiscordMessages
} from "@skyra/discord-components-react";
import { BuilderConfig, EmbedState } from "@/types/builder";
import { useTheme } from "next-themes";

interface EmbedProps {
    config: BuilderConfig;
    embed: EmbedState;
}

export const Embed = ({ config, embed }: EmbedProps) => {
    const { resolvedTheme } = useTheme();

    console.log("[Embed Debug] Rendering Embed Component:", {
        rawEmbedProp: embed,
        titleType: typeof embed.title,
        descriptionType: typeof embed.description,
        isDescriptionTruthy: !!embed.description,
    });

    const renderWithPlaceholders = (text: string | undefined): string => {
        if (!text) return "";
        let parsed = text;

        // Static placeholders
        config.placeholders.forEach((ph) => {
            if (ph.key === "random:x:y") return;
            parsed = parsed.replaceAll(`{${ph.key}}`, ph.mockValue);
        });

        // Dynamic {random:x:y} placeholders
        parsed = parsed.replace(/\{random:(-?\d+):(-?\d+)}/g, (_, minStr, maxStr) => {
            const min = parseInt(minStr, 10);
            const max = parseInt(maxStr, 10);
            if (isNaN(min) || isNaN(max)) return "42";

            const lower = Math.min(min, max);
            const upper = Math.max(min, max);

            const seed = (lower * 1337 + upper * 73) % 1000;
            const factor = seed / 1000;
            const stableValue = Math.floor(factor * (upper - lower + 1)) + lower;

            return stableValue.toString();
        });

        return parsed;
    };

    return (
        <DiscordMessages className="rounded-md overflow-hidden" no-background lightTheme={resolvedTheme == "light"}>
            <DiscordMessage>
                <DiscordEmbed
                    slot="embeds"
                    color={embed.color || "#2ecc71"}
                    authorName={renderWithPlaceholders(embed.authorName)}
                    authorImage={renderWithPlaceholders(embed.authorIcon)}
                    embedTitle={renderWithPlaceholders(embed.title)}
                    image={renderWithPlaceholders(embed.imageUrl)}
                    thumbnail={renderWithPlaceholders(embed.thumbnailUrl)}
                >
                    {/* Use the dedicated Description Component */}
                    {embed.description && (
                        <DiscordEmbedDescription slot="description">
                            {renderWithPlaceholders(embed.description)}
                        </DiscordEmbedDescription>
                    )}

                    {embed.fields && embed.fields.length > 0 && (
                        <DiscordEmbedFields slot="fields">
                            {embed.fields.map((field, index) => (
                                <DiscordEmbedField
                                    key={index}
                                    fieldTitle={renderWithPlaceholders(field.name) || "\u200B"}
                                    inline={field.inline}
                                >
                                    {renderWithPlaceholders(field.value) || "\u200B"}
                                </DiscordEmbedField>
                            ))}
                        </DiscordEmbedFields>
                    )}

                    {/* Use the dedicated Footer Component */}
                    {embed.footerText && (
                        <DiscordEmbedFooter slot="footer">
                            {renderWithPlaceholders(embed.footerText)}
                        </DiscordEmbedFooter>
                    )}
                </DiscordEmbed>
            </DiscordMessage>
        </DiscordMessages>
    );
};