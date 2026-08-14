"use client";

import { JSX, useEffect, useMemo, useState } from "react";
import { ImageCardSettings, LevelingConfig } from "@/features/leveling/types";
import { TextInput } from "@/components/ui/TextInput";
import { InputLabel } from "@/components/layout/InputLabel";

export interface ImageCardTabProps {
    config: LevelingConfig;
    handleChange: (a: Partial<LevelingConfig>) => void;
}

interface ColorPickerInputProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
}

const DUMMY_DATA = {
    username: "Oud",
    level: 10,
    xp: 700,
    maxXp: 1000,
    rank: 1,
} as const;

const clamp = (num: number, min: number, max: number): number =>
    Math.min(Math.max(num, min), max);

const getColor = (color: string, fallback: string): string =>
    color !== "" ? color : fallback;

function ColorPickerInput({ label, value, onChange }: ColorPickerInputProps): JSX.Element {
    return (
        <div className="flex flex-col">
            <InputLabel>{label}</InputLabel>
            <div className="flex items-center gap-2">
                <input
                    type="color"
                    value={value}
                    onChange={(e): void => { onChange(e.target.value); }}
                    className="w-10 h-10 rounded-md cursor-pointer border border-border bg-surface-muted p-1 transition-all focus-ring"
                />
                <TextInput
                    value={value}
                    onChange={(e): void => { onChange(e.target.value); }}
                    className="px-3 py-2 bg-surface-elevated border border-border rounded-md text-sm text-foreground focus-ring font-mono w-28 transition-all"
                />
            </div>
        </div>
    );
}

export function ImageCardTab({ config, handleChange }: ImageCardTabProps): JSX.Element {
    const [template, setTemplate] = useState<string>();

    useEffect(() => {
        void fetch("/level-template.svg")
            .then((res) => res.text())
            .then((svg) => {
                setTemplate(svg);
            })
            .catch((err: unknown) => {
                console.error("Failed to load template SVG:", err);
            });
    }, []);

    const updateImageCardSetting = (key: keyof ImageCardSettings, value: string): void => {
        handleChange({
            imageCard: {
                ...config.imageCard,
                [key]: value,
            },
        });
    };

    const manipulatedSvg = useMemo<string>(() => {
        if (template === undefined || template === "") return "";

        const card = config.imageCard;
        const maxBarWidth = 200;
        const fillWidth = clamp((DUMMY_DATA.xp / DUMMY_DATA.maxXp) * maxBarWidth, 7, 200);

        const bgColor = getColor(card.backgroundColor, "#000000");
        const barFgColor = getColor(card.barForegroundColor, "#5865F2");
        const barBgColor = getColor(card.barBackgroundColor, "#dedede");
        const separatorColor = getColor(card.lineSeparatorColor, "#5865F2");
        const usernameColor = getColor(card.usernameColor, "#5865F2");
        const statisticsColor = getColor(card.statisticsColor, "#5865F2");
        const accentColor = getColor(card.accentColor, "#5865F2");

        return template
            .replace(/fill="#000000"/g, `fill="${bgColor}"`)
            .replace(/{{BACKGROUND_COLOR}}/g, bgColor)
            .replace(/{{USERNAME}}/g, DUMMY_DATA.username)
            .replace(/{{BAR\.FOREGROUND}}/g, barFgColor)
            .replace(/{{BAR\.BACKGROUND}}/g, barBgColor)
            .replace(/{{SEPARATOR}}/g, separatorColor)
            .replace(/{{PROFILE_PICTURE}}/g, "https://cdn.discordapp.com/embed/avatars/0.png")
            .replace(/{{USERNAME_COLOR}}/g, usernameColor)
            .replace(/{{STATISTICS}}/g, statisticsColor)
            .replace(/{{ACCENT}}/g, accentColor)
            .replace(/{{LEVEL}}/g, String(DUMMY_DATA.level))
            .replace(/{{XP\.PROGRESS}}/g, String(DUMMY_DATA.xp))
            .replace(/{{XP\.MAX}}/g, String(DUMMY_DATA.maxXp))
            .replace(/{{RANK}}/g, String(DUMMY_DATA.rank))
            .replace(/{{FILL_WIDTH}}/g, fillWidth.toFixed(1));
    }, [template, config.imageCard]);

    const card = config.imageCard;

    return (
        <div className="space-y-6">
            <div
                className="w-full max-w-xl rounded-lg overflow-hidden border border-border bg-surface-muted [&>svg]:w-full [&>svg]:h-auto shadow-sm"
                dangerouslySetInnerHTML={{ __html: manipulatedSvg }}
            />

            {/* Customization Inputs Grid */}
            <div className="space-y-4 pt-4 border-t border-border-subtle">
                <div>
                    <h3 className="text-base font-bold text-foreground">Card Customization</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Customize the look of the rank card that members generate in Discord.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    <ColorPickerInput
                        label="Background Color"
                        value={card.backgroundColor}
                        onChange={(val): void => { updateImageCardSetting("backgroundColor", val); }}
                    />
                    <ColorPickerInput
                        label="Username Color"
                        value={card.usernameColor}
                        onChange={(val): void => { updateImageCardSetting("usernameColor", val); }}
                    />
                    <ColorPickerInput
                        label="Statistics Color"
                        value={card.statisticsColor}
                        onChange={(val): void => { updateImageCardSetting("statisticsColor", val); }}
                    />
                    <ColorPickerInput
                        label="Text Color"
                        value={card.textColor}
                        onChange={(val): void => { updateImageCardSetting("textColor", val); }}
                    />
                    <ColorPickerInput
                        label="Bar Foreground"
                        value={card.barForegroundColor}
                        onChange={(val): void => { updateImageCardSetting("barForegroundColor", val); }}
                    />
                    <ColorPickerInput
                        label="Bar Background"
                        value={card.barBackgroundColor}
                        onChange={(val): void => { updateImageCardSetting("barBackgroundColor", val); }}
                    />
                    <ColorPickerInput
                        label="Line Separator"
                        value={card.lineSeparatorColor}
                        onChange={(val): void => { updateImageCardSetting("lineSeparatorColor", val); }}
                    />
                    <ColorPickerInput
                        label="Accent Color"
                        value={card.accentColor}
                        onChange={(val): void => { updateImageCardSetting("accentColor", val); }}
                    />
                </div>
            </div>
        </div>
    );
}