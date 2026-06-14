"use client";

import { JSX } from "react";
import { DMTemplateSetting } from "@/types/config/moderationDMs";
import { DiscordEmbed } from "@/types/embed";
import { hexToDecimal } from "@/utils/embed";

interface DMTemplateTabProps {
    actionType: string;
    templateConfig: DMTemplateSetting;
    onChange: (updated: DMTemplateSetting) => void;
}

const TAG_SUGGESTIONS: Record<string, string[]> = {
    warn: ["{server.name}", "{member.username}", "{reason}", "{moderator.username}"],
    pardon_warn: ["{server.name}", "{member.username}", "{warn_id}"],
    unpardon_warn: ["{server.name}", "{member.username}", "{warn_id}"],
    unpardon_delete_warn: ["{server.name}", "{member.username}"],
    mute: ["{server.name}", "{member.username}", "{duration}", "{reason}", "{moderator.username}"],
    unmute: ["{server.name}", "{member.username}", "{moderator.username}"],
    kick: ["{server.name}", "{member.username}", "{reason}", "{invite.url}", "{moderator.username}"],
    ban: ["{server.name}", "{member.username}", "{reason}", "{appeal_link}", "{moderator.username}"],
    softban: ["{server.name}", "{member.username}", "{reason}"],
};

export function DMTemplateTab({
    actionType,
    templateConfig,
    onChange
}: DMTemplateTabProps): JSX.Element {

    const handleToggleEnable = (enabled: boolean) => {
        onChange({ ...templateConfig, enabled });
    };

    const handleFormatChange = (format: "text" | "embed") => {
        onChange({ ...templateConfig, format });
    };

    const handleContentChange = (content: string) => {
        onChange({ ...templateConfig, content });
    };

    const handleEmbedChange = (updatedEmbed: Partial<DiscordEmbed>) => {
        onChange({
            ...templateConfig,
            embed: {
                ...templateConfig.embed,
                ...updatedEmbed,
            },
        });
    };

    const tags = TAG_SUGGESTIONS[actionType] || [];

    const handleTagClick = (tag: string) => {
        if (templateConfig.format === "text") {
            handleContentChange(templateConfig.content + " " + tag);
        } else {
            // Append tag to embed description by default
            const currentDesc = templateConfig.embed.description || "";
            handleEmbedChange({ description: currentDesc + " " + tag });
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium capitalize">{actionType.replace(/_/g, " ")} DM Settings</h3>
                <p className="text-sm text-gray-500">
                    Configure the direct message sent to users for this action. </p>
            </div>

            {/* Enable/Disable Module Toggle */}
            <div className="flex items-center justify-between p-4 bg-zinc-900/50 rounded-lg border border-zinc-800">
                <div>
                    <p className="font-medium text-sm">Send DM on {actionType.replace(/_/g, " ")}</p>
                    <p className="text-xs text-gray-400">If disabled, no DM will be sent for this action.</p>
                </div>
                <input
                    type="checkbox"
                    checked={templateConfig.enabled}
                    onChange={(e) => handleToggleEnable(e.target.checked)}
                    className="toggle-checkbox"
                />
            </div>

            {templateConfig.enabled && (
                <div className="space-y-6">
                    {/* Format Selector */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Message Format</label>
                        <div className="flex space-x-2">
                            <button
                                type="button"
                                onClick={() => handleFormatChange("text")}
                                className={`px-4 py-2 text-sm rounded-md border transition-all ${
                                    templateConfig.format === "text"
                                        ? "bg-blue-600 border-blue-500 text-white"
                                        : "bg-zinc-900 border-zinc-800 text-gray-400 hover:text-white"
                                }`}
                            >
                                Plain Text
                            </button>
                            <button
                                type="button"
                                onClick={() => handleFormatChange("embed")}
                                className={`px-4 py-2 text-sm rounded-md border transition-all ${
                                    templateConfig.format === "embed"
                                        ? "bg-blue-600 border-blue-500 text-white"
                                        : "bg-zinc-900 border-zinc-800 text-gray-400 hover:text-white"
                                }`}
                            >
                                Rich Embed
                            </button>
                        </div>
                    </div>

                    {/* Content Editors */}
                    {templateConfig.format === "text" ? (
                        <div className="flex flex-col space-y-2">
                            <label className="text-sm font-medium">Text Content</label>
                            <textarea
                                value={templateConfig.content}
                                onChange={(e) => handleContentChange(e.target.value)}
                                rows={6}
                                className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="Type your custom notification message..."
                            />
                        </div>
                    ) : (
                        <div className="space-y-4 p-4 bg-zinc-950 border border-zinc-800 rounded-md">
                            <p className="text-sm font-medium text-gray-300">Embed Customizer</p>

                            {/* Simple Embed Fields */}
                            <div className="space-y-3">
                                <div className="flex flex-col space-y-1">
                                    <label className="text-xs text-gray-400">Embed Title</label>
                                    <input
                                        type="text"
                                        value={templateConfig.embed.title || ""}
                                        onChange={(e) => handleEmbedChange({ title: e.target.value })}
                                        className="p-2 bg-zinc-900 border border-zinc-800 rounded text-sm focus:outline-none"
                                        placeholder="Embed Title"
                                    />
                                </div>
                                <div className="flex flex-col space-y-1">
                                    <label className="text-xs text-gray-400">Embed Description</label>
                                    <textarea
                                        value={templateConfig.embed.description || ""}
                                        onChange={(e) => handleEmbedChange({ description: e.target.value })}
                                        rows={4}
                                        className="p-2 bg-zinc-900 border border-zinc-800 rounded text-sm focus:outline-none"
                                        placeholder="Embed Description"
                                    />
                                </div>
                                <div className="flex flex-col space-y-1">
                                    <label className="text-xs text-gray-400">Embed Color (Hex)</label>
                                    <input
                                        type="text"
                                        value={templateConfig.embed.color || ""}
                                        onChange={(e) => handleEmbedChange({ color: hexToDecimal(e.target.value) })}
                                        className="p-2 bg-zinc-900 border border-zinc-800 rounded text-sm focus:outline-none w-32"
                                        placeholder="#ff0000"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tag Suggestions Display */}
                    <div className="p-4 bg-zinc-900/30 border border-zinc-800 rounded-md">
                        <p className="text-xs font-semibold text-gray-400 mb-2">Available Tags (Click to append):</p>
                        <div className="flex flex-wrap gap-2">
                            {tags.map((tag) => (
                                <code
                                    key={tag}
                                    onClick={() => handleTagClick(tag)}
                                    className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 cursor-pointer rounded transition-colors text-blue-400"
                                >
                                    {tag}
                                </code>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}