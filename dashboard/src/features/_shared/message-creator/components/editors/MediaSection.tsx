import { ChangeEvent, JSX } from "react";
import { InputLabel } from "@/components/layout/InputLabel";
import { TextInput } from "@/components/ui/inputs/TextInput";
import { Section } from "./Section";
import { EmbedState } from "@/features/_shared/message-creator/types";

export function MediaSection({
    embed,
    handleChange,
}: {
    embed: EmbedState;
    handleChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}): JSX.Element {
    return (
        <Section title="Images & Media" defaultOpen={false}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <InputLabel className="block mb-1.5">Thumbnail URL</InputLabel>
                    <TextInput name="thumbnailUrl" value={embed.thumbnailUrl} onChange={handleChange} placeholder="https://..." />
                </div>
                <div>
                    <InputLabel className="block mb-1.5">Main Image URL</InputLabel>
                    <TextInput name="imageUrl" value={embed.imageUrl} onChange={handleChange} placeholder="https://..." />
                </div>
            </div>
        </Section>
    );
}