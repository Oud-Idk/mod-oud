import { ChangeEvent, JSX } from "react";
import { InputLabel } from "@/components/layout/InputLabel";
import { TextInput } from "@/components/ui/TextInput";
import { Section } from "./Section";
import { EmbedState } from "@/features/_shared/message-creator/types";

export function AuthorSection({
    embed,
    handleChange,
}: {
    embed: EmbedState;
    handleChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}): JSX.Element {
    return (
        <Section title="Author & Header" defaultOpen={false}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <InputLabel className="block mb-1.5">Author Name</InputLabel>
                    <TextInput name="authorName" value={embed.authorName} onChange={handleChange} placeholder="e.g. Server Bot" />
                </div>
                <div>
                    <InputLabel className="block mb-1.5">Author Icon URL</InputLabel>
                    <TextInput name="authorIcon" value={embed.authorIcon} onChange={handleChange} placeholder="https://..." />
                </div>
            </div>
        </Section>
    );
}