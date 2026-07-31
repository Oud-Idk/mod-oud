import { LevelingConfig, ImageCardSettings } from "@/types/db/config";
import { useEffect, useMemo, useState } from "react";

export interface ImageCardTabProps {
    config: LevelingConfig;
    handleChange: (a: Partial<LevelingConfig>) => void;
}

interface ColorPickerInputProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
}

// Fixed parameter destructuring: added onChange
function ColorPickerInput({ label, value, onChange }: ColorPickerInputProps) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-300">{label}</label>
            <div className="flex items-center gap-2">
                <input
                    type="color"
                    value={value || "#000000"}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer border border-gray-700 bg-transparent p-0.5"
                />
                <input
                    type="text"
                    value={value || "#000000"}
                    onChange={(e) => onChange(e.target.value)}
                    className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm text-white focus:outline-none focus:border-indigo-500 font-mono w-28"
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

    // Dummy preview values
    const dummyData = {
        username: "Alex",
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
            {/* Live SVG Preview */}
            <div className="space-y-2">
                <p className="text-sm font-medium text-gray-400">Card Preview</p>
                <div
                    className="w-full max-w-xl rounded-lg overflow-hidden border border-gray-800 bg-gray-950 p-2 [&>svg]:w-full [&>svg]:h-auto"
                    dangerouslySetInnerHTML={{ __html: manipulatedSvg }}
                />
            </div>

            {/* Customization Inputs Grid */}
            <div className="space-y-4">
                <h3 className="text-lg font-medium text-white">Card Customization</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
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