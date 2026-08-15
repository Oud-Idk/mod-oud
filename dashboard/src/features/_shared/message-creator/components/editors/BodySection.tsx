import { ChangeEvent, JSX } from "react";
import { InputLabel } from "@/components/layout/InputLabel";
import { TextInput } from "@/components/ui/TextInput";
import { LongTextInput } from "@/components/ui/LongTextInput";
import { Section } from "./Section";
import { EmbedState } from "@/features/_shared/message-creator/types";

const DISCORD_COLORS = [
    { name: "Default White", hex: "#ffffff" },
    { name: "Blurple", hex: "#5865F2" },
    { name: "Green", hex: "#57F287" },
    { name: "Yellow", hex: "#FEE75C" },
    { name: "Fuchsia", hex: "#EB459E" },
    { name: "Red", hex: "#ED4245" },
    { name: "Dark Neutral", hex: "#2B2D31" },
];

export function BodySection({
    embed,
    handleChange,
    handleColorChange,
}: {
    embed: EmbedState;
    handleChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    handleColorChange: (value: string) => void;
}): JSX.Element {
    return (
        <Section title="Message Body & Color" defaultOpen={true}>
            <div>
                <InputLabel className="block mb-1.5">Title</InputLabel>
                <TextInput name="title" value={embed.title} onChange={handleChange} placeholder="Embed Title" />
            </div>
            <div>
                <InputLabel className="block mb-1.5">Description Body</InputLabel>
                <LongTextInput name="description" rows={4} value={embed.description} onChange={handleChange} placeholder="Supports Markdown (*italic*, **bold**, links)..." />
            </div>
            <div>
                <InputLabel className="block mb-1.5">Accent Color</InputLabel>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                    <input
                        type="color"
                        name="color"
                        value={embed.color}
                        onChange={handleChange}
                        className="w-8 h-8 p-0 border border-border bg-surface cursor-pointer rounded overflow-hidden focus-ring"
                    />
                    {DISCORD_COLORS.map((c) => (
                        <button
                            key={c.hex}
                            type="button"
                            onClick={() =>{ handleColorChange(c.hex) }}
                            className="w-6 h-6 rounded-full border border-border transition-transform hover:scale-110 focus-ring"
                            style={{ backgroundColor: c.hex }}
                            title={c.name}
                        />
                    ))}
                    <span className="font-mono text-xs uppercase ml-2 text-muted-foreground">{embed.color}</span>
                </div>
            </div>
        </Section>
    );
}