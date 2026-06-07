import React from "react";
import { BuilderConfig, EmbedState } from "@/types/builder";

interface EmbedProps {
    config: BuilderConfig;
    embed: EmbedState;
}

export const Embed = ({ config, embed }: EmbedProps) => {
    const renderWithPlaceholders = (text: string | undefined): string => {
        if (!text) return "";
        let parsed = text;

        // 1. Replace static placeholders (skipping the template "random:x:y")
        config.placeholders.forEach((ph) => {
            if (ph.key === "random:x:y") return;
            parsed = parsed.replaceAll(`{${ph.key}}`, ph.mockValue);
        });

        // 2. Dynamically resolve {random:x:y} matches with negative or positive integers
        parsed = parsed.replace(/\{random:(-?\d+):(-?\d+)\}/g, (_, minStr, maxStr) => {
            const min = parseInt(minStr, 10);
            const max = parseInt(maxStr, 10);
            if (isNaN(min) || isNaN(max)) return "42";

            const lower = Math.min(min, max);
            const upper = Math.max(min, max);

            // Deterministic calculation to prevent preview flickering on every keystroke
            const seed = (lower * 1337 + upper * 73) % 1000;
            const factor = seed / 1000;
            const stableValue = Math.floor(factor * (upper - lower + 1)) + lower;

            return stableValue.toString();
        });

        return parsed;
    };

    return (
        <div
            className="dark:bg-[#1e1f22] bg-neutral-100 rounded-r border-l-4 p-4 max-w-130 relative flex justify-between select-none"
            style={{ borderLeftColor: embed.color || "#2ecc71" }}
        >
            <div className="flex-1 pr-4">
                {/* ── Author Preview ── */}
                {embed.authorName && (
                    <div className="flex items-center mb-1.5">
                        {embed.authorIcon && (
                            <img
                                src={renderWithPlaceholders(embed.authorIcon)}
                                alt=""
                                className="w-6 h-6 rounded-full mr-2 object-cover"
                            />
                        )}
                        <span className="text-xs font-semibold">
                            {renderWithPlaceholders(embed.authorName)}
                        </span>
                    </div>
                )}

                {/* ── Title Preview ── */}
                {embed.title && (
                    <div className="text-base font-semibold mb-2">
                        {renderWithPlaceholders(embed.title)}
                    </div>
                )}

                {/* ── Description Preview ── */}
                {embed.description && (
                    <div className="text-sm whitespace-pre-wrap leading-snug">
                        {renderWithPlaceholders(embed.description)}
                    </div>
                )}

                {/* ── Fields Preview ── */}
                {embed.fields && embed.fields.length > 0 && (
                    <div className="grid grid-cols-12 gap-y-3 gap-x-2 mt-3">
                        {embed.fields.map((field, index) => {
                            const inlineSpan = field.inline ? "col-span-4" : "col-span-12";
                            return (
                                <div key={index} className={`${inlineSpan} min-w-25`}>
                                    <div className="text-xs font-semibold">
                                        {renderWithPlaceholders(field.name) || "\u200B"}
                                    </div>
                                    <div className="text-sm mt-0.5 whitespace-pre-wrap">
                                        {renderWithPlaceholders(field.value) || "\u200B"}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ── Main Embed Image Preview ── */}
                {embed.imageUrl && (
                    <div className="mt-3 rounded overflow-hidden">
                        <img
                            src={renderWithPlaceholders(embed.imageUrl)}
                            alt=""
                            className="w-full max-h-80 object-cover rounded"
                        />
                    </div>
                )}

                {/* ── Footer Preview ── */}
                {(embed.footerText || embed.footerIcon) && (
                    <div className="flex items-center mt-3 text-xs text-neutral-500 dark:text-neutral-400">
                        {embed.footerIcon && (
                            <img
                                src={renderWithPlaceholders(embed.footerIcon)}
                                alt=""
                                className="w-5 h-5 rounded-full mr-2 object-cover"
                            />
                        )}
                        {embed.footerText && (
                            <span>{renderWithPlaceholders(embed.footerText)}</span>
                        )}
                    </div>
                )}
            </div>

            {/* ── Thumbnail Preview ── */}
            {embed.thumbnailUrl && (
                <div className="shrink-0 self-start mt-1">
                    <img
                        src={renderWithPlaceholders(embed.thumbnailUrl)}
                        alt=""
                        className="w-20 h-20 object-cover rounded"
                    />
                </div>
            )}
        </div>
    );
};