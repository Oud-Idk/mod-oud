import { EmbedState } from "@/types/builder";
import { ChangeEvent, SetStateAction, useEffect } from "react";

interface EmbedBuilderProps {
    embed: EmbedState;
    handleChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    handleFieldChange: (index: number, key: "name" | "value" | "inline", value: string | boolean) => void;
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
            className={`p-4 rounded-lg space-y-4 border ${isEmbedStateEmpty(embed) ? "border-red-500 ring-red-500" : ""}`}
        >
            {isEmbedStateEmpty(embed) && (
                <p className="text-red-500">Embed cannot be completely empty!</p>
            )}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs font-bold uppercase tracking-wider">Author Title</label>
                    <input
                        type="text"
                        name="authorName"
                        value={embed.authorName || ""}
                        onChange={handleChange}
                        className={`w-full mt-1 p-2 bg-neutral-300/5 border border-neutral-700 rounded text-sm focus:outline-none focus:ring-2 ${isEmbedStateEmpty(embed) ? "border-red-500 ring-red-500" : ""}`}
                    />
                </div>
                <div>
                    <label className="text-xs font-bold uppercase tracking-wider">Author Icon URL</label>
                    <input
                        type="text"
                        name="authorIcon"
                        value={embed.authorIcon || ""}
                        onChange={handleChange}
                        className={`w-full mt-1 p-2 bg-neutral-300/5 border border-neutral-700 rounded text-sm focus:outline-none focus:ring-2 ${isEmbedStateEmpty(embed) ? "border-red-500 ring-red-500" : ""}`}
                    />
                </div>
            </div>

            {/* ── Main Embed Content ── */}
            <div>
                <label className="text-xs font-bold uppercase tracking-wider">Title</label>
                <input
                    type="text"
                    name="title"
                    value={embed.title || ""}
                    onChange={handleChange}
                    className={`w-full mt-1 p-2 bg-neutral-300/5 border border-neutral-700 rounded text-sm focus:outline-none focus:ring-2 ${isEmbedStateEmpty(embed) ? "border-red-500 ring-red-500" : ""}`}
                />
            </div>

            <div>
                <label className="text-xs font-bold uppercase tracking-wider">Description Body</label>
                <textarea
                    name="description"
                    rows={5}
                    value={embed.description || ""}
                    onChange={handleChange}
                    className={`w-full mt-1 p-2 bg-neutral-300/5 border border-neutral-700 rounded text-sm focus:outline-none focus:ring-2 resize-none font-mono ${isEmbedStateEmpty(embed) ? "border-red-500 ring-red-500" : ""}`}
                />
            </div>

            {/* ── Images Block ── */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs font-bold uppercase tracking-wider">Thumbnail URL</label>
                    <input
                        type="text"
                        name="thumbnailUrl"
                        value={embed.thumbnailUrl || ""}
                        onChange={handleChange}
                        className={`w-full mt-1 p-2 bg-neutral-300/5 border border-neutral-700 rounded text-sm focus:outline-none focus:ring-2 ${isEmbedStateEmpty(embed) ? "border-red-500 ring-red-500" : ""}`}
                    />
                </div>
                <div>
                    <label className="text-xs font-bold uppercase tracking-wider">Embed Image URL</label>
                    <input
                        type="text"
                        name="imageUrl"
                        value={embed.imageUrl || ""}
                        onChange={handleChange}
                        className={`w-full mt-1 p-2 bg-neutral-300/5 border border-neutral-700 rounded text-sm focus:outline-none focus:ring-2 ${isEmbedStateEmpty(embed) ? "border-red-500 ring-red-500" : ""}`}
                    />
                </div>
            </div>

            {/* ── Footer Block ── */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs font-bold uppercase tracking-wider">Footer Text</label>
                    <input
                        type="text"
                        name="footerText"
                        value={embed.footerText || ""}
                        onChange={handleChange}
                        className={`w-full mt-1 p-2 bg-neutral-300/5 border border-neutral-700 rounded text-sm focus:outline-none focus:ring-2 ${isEmbedStateEmpty(embed) ? "border-red-500 ring-red-500" : ""}`}
                    />
                </div>
                <div>
                    <label className="text-xs font-bold uppercase tracking-wider">Footer Icon URL</label>
                    <input
                        type="text"
                        name="footerIcon"
                        value={embed.footerIcon || ""}
                        onChange={handleChange}
                        className={`w-full mt-1 p-2 bg-neutral-300/5 border border-neutral-700 rounded text-sm focus:outline-none focus:ring-2 ${isEmbedStateEmpty(embed) ? "border-red-500 ring-red-500" : ""}`}
                    />
                </div>
            </div>

            {/* ── Color Picker ── */}
            <div>
                <label className="text-xs font-bold uppercase tracking-wider">Accent Color</label>
                <div className="flex items-center mt-1 space-x-3">
                    <input
                        type="color"
                        name="color"
                        value={embed.color || "#ffffff"}
                        onChange={handleChange}
                        className="w-10 h-10 p-0 border-0 bg-transparent cursor-pointer rounded"
                    />
                    <span className="text-xs font-mono uppercase text-white">{embed.color}</span>
                </div>
            </div>

            {/* ── Fields Section ── */}
            <div className="space-y-3 border-t pt-4">
                <div className="flex justify-between items-center">
                    <label className="text-xs font-bold uppercase tracking-wider">Embed Fields
                        ({embed.fields?.length || 0})</label>
                    <button
                        type="button"
                        onClick={addField}
                        className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded transition font-semibold"
                    >
                        + Add Field
                    </button>
                </div>

                <div className="space-y-3">
                    {embed.fields?.map((field, idx) => (
                        <div
                            key={idx} className="p-3 border space-y-2 relative"
                        >
                            <button
                                type="button"
                                onClick={() => removeField(idx)}
                                className="absolute top-3 right-3 text-xs text-rose-500 hover:text-rose-400 font-semibold"
                            >
                                Remove
                            </button>
                            <div className="grid grid-cols-2 gap-3 pr-16">
                                <div>
                                    <label className="text-[10px] uppercase font-bold">Field Name</label>
                                    <input
                                        type="text"
                                        value={field.name}
                                        onChange={(e) => handleFieldChange(idx, "name", e.target.value)}
                                        className="w-full mt-1 p-1.5 bg-neutral-300/5 border border-neutral-700 rounded text-xs focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold">Field Value</label>
                                    <input
                                        type="text"
                                        value={field.value}
                                        onChange={(e) => handleFieldChange(idx, "value", e.target.value)}
                                        className="w-full mt-1 p-1.5 bg-neutral-300/5 border border-neutral-700 rounded text-xs focus:outline-none"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center space-x-2 pt-1">
                                <input
                                    type="checkbox"
                                    id={`inline-${idx}`}
                                    checked={field.inline || false}
                                    onChange={(e) => handleFieldChange(idx, "inline", e.target.checked)}
                                    className="rounded bg-neutral-300/5 border-neutral-700"
                                />
                                <label
                                    htmlFor={`inline-${idx}`}
                                    className="text-[10px] uppercase font-bold text-neutral-400 select-none cursor-pointer"
                                >
                                    Display Inline
                                </label>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};