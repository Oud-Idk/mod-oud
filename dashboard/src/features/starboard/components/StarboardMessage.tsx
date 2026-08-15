import React, {JSX} from "react";
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
    text: string;
}

export const StarboardMessage = ({ config, embed, text }: EmbedProps): JSX.Element => {
    const { resolvedTheme } = useTheme();

    const renderWithPlaceholders = (text: string | undefined): string => {
        if (text === undefined) return "";
        let parsed = text;

        config.placeholders.forEach((ph) => {
            parsed = parsed.replaceAll(`{${ph.key}}`, ph.mockValue);
        });

        return parsed;
    };

    return (
        <DiscordMessages
            className="rounded-md overflow-hidden" lightTheme={resolvedTheme == 'light'} noBackground
        >
            <DiscordMessage lightTheme={resolvedTheme == 'light'}>
                <p>{renderWithPlaceholders(text)}</p>
                <DiscordEmbed
                    slot="embeds"
                    color={embed.color}
                    authorName={renderWithPlaceholders(embed.authorName)}
                    authorImage={renderWithPlaceholders(embed.authorIcon)}
                    embedTitle={renderWithPlaceholders(embed.title)}
                    image={renderWithPlaceholders(embed.imageUrl)}
                    thumbnail={renderWithPlaceholders(embed.thumbnailUrl)}
                >
                    {/* Use the dedicated Description Component */}
                    {embed.description !== "" && (
                        <DiscordEmbedDescription slot="description">
                            {renderWithPlaceholders(embed.description)}
                        </DiscordEmbedDescription>
                    )}

                    {embed.fields.length > 0 && (
                        <DiscordEmbedFields slot="fields">
                            {embed.fields.map((field, index) => (
                                <DiscordEmbedField
                                    key={index}
                                    fieldTitle={renderWithPlaceholders(field.name)}
                                    inline={field.inline}
                                >
                                    {renderWithPlaceholders(field.value)}
                                </DiscordEmbedField>
                            ))}
                        </DiscordEmbedFields>
                    )}

                    {/* Use the dedicated Footer Component */}
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