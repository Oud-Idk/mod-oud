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
import { useTheme } from "next-themes";
import { BuilderConfig } from "@/features/_shared/builderConfig";
import { EmbedState } from "@/features/_shared/message-creator/types";

interface EmbedProps {
    config: BuilderConfig;
    embed: EmbedState;
}

export const EmbedPreview = ({ config, embed }: EmbedProps) => {
    const { resolvedTheme } = useTheme();

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

    // Helper to format string with real React <br /> tags
    const renderFormattedText = (text: string | undefined) => {
        const parsed = renderWithPlaceholders(text);
        if (!parsed) return "";

        return parsed.split("\n").map((line, i, arr) => (
            <React.Fragment key={i}>
                {line}
                {i < arr.length - 1 && <br/>}
            </React.Fragment>
        ));
    };

    return (
        <DiscordMessages className="rounded-md overflow-hidden" no-background lightTheme={resolvedTheme === "light"}>
            <DiscordMessage>
                <DiscordEmbed
                    slot="embeds"
                    color={embed.color || "#ffffff"}
                    authorName={renderWithPlaceholders(embed.authorName)}
                    authorImage={renderWithPlaceholders(embed.authorIcon)}
                    embedTitle={renderWithPlaceholders(embed.title)}
                    image={renderWithPlaceholders(embed.imageUrl)}
                    thumbnail={renderWithPlaceholders(embed.thumbnailUrl)}
                >
                    {/* Description */}
                    {embed.description && (
                        <DiscordEmbedDescription slot="description">
                            {renderFormattedText(embed.description)}
                        </DiscordEmbedDescription>
                    )}

                    {/* Fields */}
                    {embed.fields && embed.fields.length > 0 && (
                        <DiscordEmbedFields slot="fields">
                            {embed.fields.map((field, index) => (
                                <DiscordEmbedField
                                    key={index}
                                    fieldTitle={renderWithPlaceholders(field.name) || "\u200B"}
                                    inline={field.inline}
                                >
                                    {renderFormattedText(field.value) || "\u200B"}
                                </DiscordEmbedField>
                            ))}
                        </DiscordEmbedFields>
                    )}

                    {/* Footer */}
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