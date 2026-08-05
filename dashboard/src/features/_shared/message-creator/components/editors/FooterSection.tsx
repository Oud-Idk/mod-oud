import { ChangeEvent } from "react";
import { InputLabel } from "@/components/layout/InputLabel";
import { TextInput } from "@/components/ui/TextInput";
import { Section } from "./Section";
import { EmbedState } from "@/features/_shared/message-creator/types";

export function FooterSection({
    embed,
    handleChange,
}: {
    embed: EmbedState;
    handleChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}) {
    return (
        <Section title="Footer" defaultOpen={false}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <InputLabel className="block mb-1.5">Footer Text</InputLabel>
                    <TextInput name="footerText" value={embed.footerText || ""} onChange={handleChange} placeholder="Footer Text" />
                </div>
                <div>
                    <InputLabel className="block mb-1.5">Footer Icon URL</InputLabel>
                    <TextInput name="footerIcon" value={embed.footerIcon || ""} onChange={handleChange} placeholder="https://..." />
                </div>
            </div>
        </Section>
    );
}