"use client";

import { JSX, useEffect, useMemo, useState } from "react";
import { InputLabel } from "@/components/layout/InputLabel";
import { TextInput } from "@/components/ui/inputs/TextInput";
import type { WelcomeImageStyle } from "../types";

interface WelcomeImageStyleEditorProps {
    style: WelcomeImageStyle;
    disabled?: boolean;
    onChange: (style: WelcomeImageStyle) => void;
}

interface ColorPickerInputProps {
    label: string;
    value: string;
    disabled?: boolean;
    onChange: (value: string) => void;
}

const PREVIEW_DATA = {
    username: "User",
    serverName: "Guild",
    memberCount: 42,
} as const;

const PREVIEW_AVATAR = "https://cdn.discordapp.com/embed/avatars/0.png";

const getColor = (color: string, fallback: string): string =>
    color.trim() !== "" ? color : fallback;

// Mirrors the bot's shrink-to-fit thresholds in `join_leave/image.rs`.
const usernameSize = (username: string): number => {
    if (username.length <= 12) return 46;
    if (username.length <= 18) return 36;
    return 28;
};

// Local duplicate of leveling's picker (Golden Rule: share at 3+ users).
function ColorPickerInput({ label, value, disabled = false, onChange }: ColorPickerInputProps): JSX.Element {
    return (
        <div className="flex flex-col">
            <InputLabel>{label}</InputLabel>
            <div className="flex items-center gap-2">
                <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
                    disabled={disabled}
                    onChange={(e): void => { onChange(e.target.value); }}
                    className="w-10 h-10 rounded-md cursor-pointer border border-border bg-surface-muted p-1 transition-all focus-ring"
                />
                <TextInput
                    value={value}
                    disabled={disabled}
                    onChange={(e): void => { onChange(e.target.value); }}
                    className="px-3 py-2 bg-surface-elevated border border-border rounded-md text-sm text-foreground focus-ring font-mono w-28 transition-all"
                />
            </div>
        </div>
    );
}

export function WelcomeImageStyleEditor({ style, disabled = false, onChange }: WelcomeImageStyleEditorProps): JSX.Element {
    const [template, setTemplate] = useState<string>("");

    useEffect(() => {
        void fetch("/welcome-template.svg")
            .then((res) => res.text())
            .then((svg) => { setTemplate(svg); })
            .catch((err: unknown) => {
                console.error("Failed to load welcome template SVG:", err);
            });
    }, []);

    const update = (key: keyof WelcomeImageStyle, value: string): void => {
        onChange({ ...style, [key]: value });
    };

    const previewSvg = useMemo<string>(() => {
        if (template === "") return "";
        return template
            .replace(/{{USERNAME}}/g, PREVIEW_DATA.username)
            .replace(/{{USERNAME_SIZE}}/g, String(usernameSize(PREVIEW_DATA.username)))
            .replace(/{{SERVER_NAME}}/g, PREVIEW_DATA.serverName)
            .replace(/{{MEMBER_COUNT}}/g, String(PREVIEW_DATA.memberCount))
            .replace(/{{PROFILE_PICTURE}}/g, PREVIEW_AVATAR)
            .replace(/{{BACKGROUND_COLOR}}/g, getColor(style.backgroundColor, "#2B2D31"))
            .replace(/{{ACCENT_COLOR}}/g, getColor(style.accentColor, "#5865F2"))
            .replace(/{{AVATAR_RING_COLOR}}/g, getColor(style.avatarRingColor, "#5865F2"))
            .replace(/{{HEADING_COLOR}}/g, getColor(style.headingColor, "#FFFFFF"))
            .replace(/{{USERNAME_COLOR}}/g, getColor(style.usernameColor, "#FFFFFF"))
            .replace(/{{ACCENT_DIAG_COLOR}}/g, getColor(style.accentDiagColor, "#B5BAC1"))
            .replace(/{{MEMBER_TEXT_COLOR}}/g, getColor(style.memberTextColor, "#B5BAC1"))
            .replace(/{{SEPARATOR_COLOR}}/g, getColor(style.separatorColor, "#FFFFFF"));
    }, [template, style]);

    return (
        <div className="space-y-4">
            <div
                className="w-full max-w-xl rounded-lg overflow-hidden border border-border bg-surface-muted [&>svg]:w-full [&>svg]:h-auto shadow-sm"
                dangerouslySetInnerHTML={{ __html: previewSvg }}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                <ColorPickerInput label="Background" value={style.backgroundColor} disabled={disabled} onChange={(v): void => { update("backgroundColor", v); }} />
                <ColorPickerInput label="Accent Bar" value={style.accentColor} disabled={disabled} onChange={(v): void => { update("accentColor", v); }} />
                <ColorPickerInput label="Avatar Ring" value={style.avatarRingColor} disabled={disabled} onChange={(v): void => { update("avatarRingColor", v); }} />
                <ColorPickerInput label="Heading" value={style.headingColor} disabled={disabled} onChange={(v): void => { update("headingColor", v); }} />
                <ColorPickerInput label="Username" value={style.usernameColor} disabled={disabled} onChange={(v): void => { update("usernameColor", v); }} />
                <ColorPickerInput label="Member Line" value={style.memberTextColor} disabled={disabled} onChange={(v): void => { update("memberTextColor", v); }} />
                <ColorPickerInput label="Diagnoal Accent" value={style.accentDiagColor} disabled={disabled} onChange={(v): void => { update("accentDiagColor", v); }} />
                <ColorPickerInput label="Separator" value={style.separatorColor} disabled={disabled} onChange={(v): void => { update("separatorColor", v); }} />
            </div>
        </div>
    );
}
