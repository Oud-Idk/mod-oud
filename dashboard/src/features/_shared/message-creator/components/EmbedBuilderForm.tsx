import { ChangeEvent, SetStateAction, useEffect } from "react";
import { InputLabel } from "@/components/layout/InputLabel";
import { LongTextInput } from "@/components/ui/LongTextInput";
import { TextInput } from "@/components/ui/TextInput";
import PrimaryButton from "@/components/ui/buttons/PrimaryButton";
import AlertButton from "@/components/ui/buttons/AlertButton";
import { FieldKey } from "@/features/_shared/embed";
import { EmbedState } from "@/features/_shared/message-creator/types";

interface EmbedBuilderProps {
    embed: EmbedState;
    handleChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    handleFieldChange: (index: number, key: FieldKey, value: string | boolean) => void;
    addField: () => void;
    removeField: (index: number) => void;
    setIsEmpty: (value: SetStateAction<boolean>) => void;
}

function isEmbedStateEmpty(embed: EmbedState): boolean {
    const hasTitle = embed.title.trim() !== "";
    const hasDescription = embed.description.trim() !== "";
    const hasThumbnail = embed.thumbnailUrl.trim() !== "";
    const hasAuthor = embed.authorName.trim() !== "" || embed.authorIcon.trim() !== "";
    const hasFooter = embed.footerText.trim() !== "" || embed.footerIcon.trim() !== "";
    const hasImage = embed.imageUrl.trim() !== "";

    const hasFields = embed.fields?.some(
        field => field.name.trim() !== "" || field.value.trim() !== ""
    );

    return !(
        hasTitle ||
        hasDescription ||
        hasThumbnail ||
        hasAuthor ||
        hasFooter ||
        hasImage ||
        hasFields
    );
}

export const EmbedBuilderForm = ({
    embed,
    handleChange,
    handleFieldChange,
    addField,
    removeField,
    setIsEmpty,
}: EmbedBuilderProps) => {
    useEffect(() => {
        setIsEmpty(isEmbedStateEmpty(embed));
    }, [embed])

    return (
        <div
            className={`p-4 rounded-lg space-y-2 border ${isEmbedStateEmpty(embed) ? "border-red-700 dark:border-red-300" : ""}`}
        >
            {isEmbedStateEmpty(embed) && (
                <p className="text-red-700 dark:text-red-300">Embed cannot be completely empty!</p>
            )}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <InputLabel>Author Title</InputLabel>
                    <TextInput
                        name="authorName"
                        value={embed.authorName || ""}
                        onChange={handleChange}
                    />
                </div>
                <div>
                    <InputLabel>Author Icon URL</InputLabel>
                    <TextInput
                        name="authorIcon"
                        value={embed.authorIcon || ""}
                        onChange={handleChange}
                    />
                </div>
            </div>

            <div>
                <InputLabel>Title</InputLabel>
                <TextInput
                    name="title"
                    value={embed.title || ""}
                    onChange={handleChange}
                />
            </div>

            <div>
                <InputLabel>Description Body</InputLabel>
                <LongTextInput
                    name="description" rows={5} value={embed.description || ""} onChange={handleChange}
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <InputLabel>Thumbnail URL</InputLabel>
                    <TextInput
                        name="thumbnailUrl" value={embed.thumbnailUrl || ""} onChange={handleChange}
                    />
                </div>
                <div>
                    <InputLabel>Embed Image URL</InputLabel>
                    <TextInput
                        name="imageUrl" value={embed.imageUrl || ""} onChange={handleChange}
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <InputLabel>Footer Text</InputLabel>
                    <TextInput
                        name="footerText" value={embed.footerText || ""} onChange={handleChange}
                    />
                </div>
                <div>
                    <InputLabel>Footer Icon URL</InputLabel>
                    <TextInput
                        name="footerIcon" value={embed.footerIcon || ""} onChange={handleChange}
                    />
                </div>
            </div>

            <div>
                <InputLabel>Accent Color</InputLabel>
                <div className="flex items-center mt-1 space-x-3">
                    <input
                        type="color"
                        name="color"
                        value={embed.color || "#ffffff"}
                        onChange={handleChange}
                        className="w-10 h-10 p-0 border-0 bg-transparent cursor-pointer rounded"
                    />
                    <span className="font-mono uppercase">{embed.color}</span>
                </div>
            </div>

            <div className="space-y-3 border-t pt-4">
                <div className="flex justify-between items-center">
                    <InputLabel>Embed Fields
                        ({embed.fields?.length || 0})</InputLabel>
                    <PrimaryButton onClick={addField}>+ Add Field</PrimaryButton>
                </div>

                <div className="space-y-3">
                    {embed.fields?.map((field, idx) => (
                        <div
                            key={idx} className="p-3 border space-y-2 relative"
                        >
                            <div className="grid grid-cols-2 gap-3 pr-16">
                                <div>
                                    <InputLabel>Field Name</InputLabel>
                                    <TextInput
                                        value={field.name}
                                        onChange={(e) => handleFieldChange(idx, "NAME", e.target.value)}
                                        className="p-1"
                                    />
                                </div>
                                <div>
                                    <InputLabel>Field Value</InputLabel>
                                    <TextInput
                                        value={field.value}
                                        onChange={(e) => handleFieldChange(idx, "VALUE", e.target.value)}
                                        className="p-1"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center justify-between space-x-2 pt-1">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id={`inline-${idx}`}
                                        checked={field.inline || false}
                                        onChange={(e) => handleFieldChange(idx, "INLINE", e.target.checked)}
                                        className="rounded bg-neutral-300/5 border-neutral-700"
                                    />
                                    <InputLabel>
                                        Display Inline
                                    </InputLabel>
                                </div>
                                <AlertButton
                                    onClick={() => removeField(idx)} className="py-1 px-2 text-sm"
                                >
                                    Remove
                                </AlertButton>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};