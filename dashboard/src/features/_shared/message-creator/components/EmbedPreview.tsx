import React, { JSX } from "react";
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

export const EmbedPreview = ({ config, embed }: EmbedProps): JSX.Element => {
    const { resolvedTheme } = useTheme();

    const renderWithPlaceholders = (text: string | undefined): string => {
        if (text === undefined || text === "") return "";
        let parsed = text;

        // Static placeholders
        config.placeholders.forEach((ph) => {
            if (ph.key === "random:x:y") return;
            parsed = parsed.replaceAll(`{${ph.key}}`, ph.mockValue);
        });

        // Dynamic {random:x:y} placeholders
        parsed = parsed.replace(/\{random:(-?\d+):(-?\d+)}/g, (_: string, minStr: string, maxStr: string): string => {
            const min = parseInt(minStr, 10);
            const max = parseInt(maxStr, 10);
            if (Number.isNaN(min) || Number.isNaN(max)) return "42";

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
    const renderFormattedText = (text: string | undefined): React.ReactNode => {
        const parsed = renderWithPlaceholders(text);
        if (parsed === "") return "\u200B";

        return parsed.split("\n").map((line, i, arr) => (
            <React.Fragment key={i}>
                {line}
                {i < arr.length - 1 && <br/>}
            </React.Fragment>
        ));
    };

    const colorValue = embed.color !== "" ? embed.color : "#ffffff";

    return (
        <DiscordMessages className="rounded-md overflow-hidden" no-background lightTheme={resolvedTheme === "light"}>
            <DiscordMessage>
                <DiscordEmbed
                    slot="embeds"
                    color={colorValue}
                    authorName={renderWithPlaceholders(embed.authorName)}
                    authorImage={renderWithPlaceholders(embed.authorIcon)}
                    embedTitle={renderWithPlaceholders(embed.title)}
                    image={renderWithPlaceholders(embed.imageUrl)}
                    thumbnail={renderWithPlaceholders(embed.thumbnailUrl)}
                >
                    {/* Description */}
                    {embed.description !== "" && (
                        <DiscordEmbedDescription slot="description">
                            {renderFormattedText(embed.description)}
                        </DiscordEmbedDescription>
                    )}

                    {/* Fields */}
                    {embed.fields.length > 0 && (
                        <DiscordEmbedFields slot="fields">
                            {embed.fields.map((field, index) => {
                                const title = renderWithPlaceholders(field.name);
                                return (
                                    <DiscordEmbedField
                                        key={index}
                                        fieldTitle={title !== "" ? title : "\u200B"}
                                        inline={field.inline}
                                    >
                                        {renderFormattedText(field.value)}
                                    </DiscordEmbedField>
                                );
                            })}
                        </DiscordEmbedFields>
                    )}

                    {/* Footer */}
                    {embed.footerText !== "" && (
                        <DiscordEmbedFooter slot="footer">
                            {renderWithPlaceholders(embed.footerText)}
                        </DiscordEmbedFooter>
                    )}
                </DiscordEmbed>
            </DiscordMessage>
        </DiscordMessages>
    );
};