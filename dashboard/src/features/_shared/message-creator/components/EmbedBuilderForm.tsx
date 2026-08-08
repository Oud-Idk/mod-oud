import { ChangeEvent } from "react";
import { EmbedState } from "@/features/_shared/message-creator/types";
import { EmbedField } from "@/features/_shared/embed";
import { AuthorSection } from "./editors/AuthorSection";
import { BodySection } from "./editors/BodySection";
import { MediaSection } from "./editors/MediaSection";
import { FieldsSection } from "./editors/FieldsSection";
import { FooterSection } from "./editors/FooterSection";
import { cn } from "@/lib/cn";

interface EmbedBuilderProps {
    embed: EmbedState;
    handleChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    handleFieldChange: (index: number, key: keyof EmbedField, value: string | boolean) => void;
    addField: () => void;
    removeField: (index: number) => void;
    moveField?: (fromIndex: number, toIndex: number) => void;
    isEmpty: boolean;
}

export const EmbedBuilderForm = ({
    embed,
    handleChange,
    handleFieldChange,
    addField,
    removeField,
    moveField,
    isEmpty,
}: EmbedBuilderProps) => {
    return (
        <div
            className={cn(
                "space-y-4 rounded-xl border p-4 bg-surface transition-colors",
                isEmpty ? "border-danger-border" : "border-border"
            )}
        >
            {isEmpty && (
                <div className="p-3 rounded-lg bg-danger-subtle border border-danger-border text-danger text-sm font-semibold">
                    Embed cannot be completely empty. Add a title, description, field, or image.
                </div>
            )}

            <AuthorSection embed={embed} handleChange={handleChange} />
            <BodySection embed={embed} handleChange={handleChange} />
            <MediaSection embed={embed} handleChange={handleChange} />
            <FieldsSection
                embed={embed}
                handleFieldChange={handleFieldChange}
                addField={addField}
                removeField={removeField}
                moveField={moveField}
            />
            <FooterSection embed={embed} handleChange={handleChange} />
        </div>
    );
};