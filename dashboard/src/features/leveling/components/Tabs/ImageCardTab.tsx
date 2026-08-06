"use client";

import { useEffect, useMemo, useState } from "react";
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

function ColorPickerInput({ label, value, onChange }: ColorPickerInputProps) {
    return (
        <div className="flex flex-col">
            <InputLabel>{label}</InputLabel>
            <div className="flex items-center gap-2">
                <input
                    type="color"
                    value={value || "#000000"}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-10 h-10 rounded-md cursor-pointer border border-border bg-surface-muted p-1 transition-all focus-ring"
                />
                <TextInput
                    value={value || "#000000"}
                    onChange={(e) => onChange(e.target.value)}
                    className="px-3 py-2 bg-surface-elevated border border-border rounded-md text-sm text-foreground focus-ring font-mono w-28 transition-all"
                />
            </div>
        </div>
    );
}

export function ImageCardTab({ config, handleChange }: ImageCardTabProps) {
    const [template, setTemplate] = useState<string>();

    useEffect(() => {
        fetch('/level-template.svg')
            .then(res => res.text())
            .then(svg => setTemplate(svg));
    }, []);

    const updateImageCardSetting = (key: keyof ImageCardSettings, value: string) => {
        handleChange({
            imageCard: {
                ...config.imageCard,
                [key]: value,
            },
        });
    };

    const clamp = (num: number, min: number, max: number) => Math.min(Math.max(num, min), max);

    const dummyData = {
        username: "Oud",
        level: 10,
        xp: 700,
        maxXp: 1000,
        rank: 1,
    };

    const manipulatedSvg = useMemo(() => {
        if (!template) return '';

        const card = config.imageCard ?? {};
        const maxBarWidth = 200;
        const fillWidth = clamp((dummyData.xp / dummyData.maxXp) * maxBarWidth, 7, 200);

        return template
            .replace(/fill="#000000"/g, `fill="${card.backgroundColor || '#000000'}"`)
            .replace(/{{BACKGROUND_COLOR}}/g, card.backgroundColor || '#000000')
            .replace(/{{USERNAME}}/g, dummyData.username)
            .replace(/{{BAR\.FOREGROUND}}/g, card.barForegroundColor || '#5865F2')
            .replace(/{{BAR\.BACKGROUND}}/g, card.barBackgroundColor || '#dedede')
            .replace(/{{SEPARATOR}}/g, card.lineSeparatorColor || '#5865F2')
            .replace(/{{PROFILE_PICTURE}}/g, "https://cdn.discordapp.com/embed/avatars/0.png")
            .replace(/{{USERNAME_COLOR}}/g, card.usernameColor || '#5865F2')
            .replace(/{{STATISTICS}}/g, card.statisticsColor || '#5865F2')
            .replace(/{{ACCENT}}/g, card.accentColor || '#5865F2')
            .replace(/{{LEVEL}}/g, dummyData.level.toString())
            .replace(/{{XP\.PROGRESS}}/g, dummyData.xp.toString())
            .replace(/{{XP\.MAX}}/g, dummyData.maxXp.toString())
            .replace(/{{RANK}}/g, dummyData.rank.toString())
            .replace(/{{FILL_WIDTH}}/g, fillWidth.toFixed(1));
    }, [template, config.imageCard]);

    const card = config.imageCard ?? {};

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
                        onChange={(val) => updateImageCardSetting("backgroundColor", val)}
                    />
                    <ColorPickerInput
                        label="Username Color"
                        value={card.usernameColor}
                        onChange={(val) => updateImageCardSetting("usernameColor", val)}
                    />
                    <ColorPickerInput
                        label="Statistics Color"
                        value={card.statisticsColor}
                        onChange={(val) => updateImageCardSetting("statisticsColor", val)}
                    />
                    <ColorPickerInput
                        label="Text Color"
                        value={card.textColor}
                        onChange={(val) => updateImageCardSetting("textColor", val)}
                    />
                    <ColorPickerInput
                        label="Bar Foreground"
                        value={card.barForegroundColor}
                        onChange={(val) => updateImageCardSetting("barForegroundColor", val)}
                    />
                    <ColorPickerInput
                        label="Bar Background"
                        value={card.barBackgroundColor}
                        onChange={(val) => updateImageCardSetting("barBackgroundColor", val)}
                    />
                    <ColorPickerInput
                        label="Line Separator"
                        value={card.lineSeparatorColor}
                        onChange={(val) => updateImageCardSetting("lineSeparatorColor", val)}
                    />
                    <ColorPickerInput
                        label="Accent Color"
                        value={card.accentColor}
                        onChange={(val) => updateImageCardSetting("accentColor", val)}
                    />
                </div>
            </div>
        </div>
    );
}