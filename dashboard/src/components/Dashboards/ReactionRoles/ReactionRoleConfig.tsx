import React, { SetStateAction, useState } from "react";
import { useRouter } from "next/navigation";
import { Dropdown } from "@/components/Inputs/Dropdown";
import { MessageConfigEditor } from "@/components/MessageCreator/MessageConfigEditor";
import { REACTION_ROLES_CONFIG } from "@/utils/embedTemplates";
import { TextInput } from "@/components/Inputs/TextInput";
import SecondaryButton from "@/components/Inputs/Buttons/SecondaryButton";
import { ButtonRole, ReactionMessage, ReactionRole } from "@/types/db/reactionRole";
import { ReactionRoleMode } from "@/types/db";

interface ReactionRoleConfigProps {
    config: ReactionMessage;
    channelMap: Record<string, string>;
    roleMap: Record<string, string>;
    isPending: boolean;
    isDirty: boolean;
    onDelete: (id: number) => Promise<boolean>;
    onSend: (id: number) => Promise<{ message_id: string }>;
    onChange: (updated: ReactionMessage) => void;
    guildId: string;
    setIsEmpty: (isEmpty: SetStateAction<boolean>) => void;
    onDeleteDiscordMessage: (id: number) => Promise<{ success: boolean }>;
    isEmpty: boolean;
}

export function ReactionRoleConfig({
    config,
    isPending,
    isDirty,
    channelMap,
    roleMap,
    guildId,
    onDelete,
    onSend,
    onChange,
    setIsEmpty,
    onDeleteDiscordMessage,
    isEmpty,
}: ReactionRoleConfigProps) {
    const router = useRouter();
    const [isDeleting, setIsDeleting] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [isActionPending, setIsActionPending] = useState(false);

    const reactions = config.reactions || [];
    const buttons = config.buttons || [];

    const handleDelete = (id: number) => {
        setIsDeleting(true);
        onDelete(id)
            .then(() => {
                router.push(`/dashboard/${guildId}/reaction-roles`);
            })
            .catch(() => {
                alert("Failed to delete configuration.");
                setIsDeleting(false);
            });
    };

    const handleSend = () => {
        if (isDirty) {
            alert("Please save your changes before sending the message to Discord.");
            return;
        }
        setIsSending(true);
        onSend(config.id)
            .catch((err) => {
                alert(err.message || "Failed to send message to Discord.");
            })
            .finally(() => {
                setIsSending(false);
            });
    };

    // --- REACTION MODE HANDLERS ---
    const handleAddReaction = () => {
        const updatedReactions = [...reactions, { emoji: "", role_id: "" }];
        onChange({ ...config, reactions: updatedReactions });
    };

    const handleUpdateReaction = (index: number, key: keyof ReactionRole, value: string) => {
        const updatedReactions = reactions.map((r, idx) => {
            if (idx === index) {
                return { ...r, [key]: value };
            }
            return r;
        });
        onChange({ ...config, reactions: updatedReactions });
    };

    const handleRemoveReaction = (index: number) => {
        const updatedReactions = reactions.filter((_, idx) => idx !== index);
        onChange({ ...config, reactions: updatedReactions });
    };

    // --- BUTTON MODE HANDLERS ---
    const handleAddButton = () => {
        const uniqueId = `btn_${Math.random().toString(36).substr(2, 9)}`;
        const updatedButtons: ButtonRole[] = [
            ...buttons,
            { role_id: "", custom_id: uniqueId, label: "Get Role", style: "PRIMARY" }
        ];
        onChange({ ...config, buttons: updatedButtons });
    };

    const handleUpdateButton = (index: number, key: keyof ButtonRole, value: string) => {
        const updatedButtons = buttons.map((b, idx) => {
            if (idx === index) {
                return { ...b, [key]: value };
            }
            return b;
        });
        onChange({ ...config, buttons: updatedButtons });
    };

    const handleDeleteDiscordMessage = () => {
        setIsActionPending(true);
        onDeleteDiscordMessage(config.id)
            .then(() => {
                onChange({ ...config, message_id: undefined });
            })
            .catch((err) => {
                alert(err.message || "Failed to delete message from Discord.");
            })
            .finally(() => {
                setIsActionPending(false);
            });
    };

    const handleRemoveButton = (index: number) => {
        const updatedButtons = buttons.filter((_, idx) => idx !== index);
        onChange({ ...config, buttons: updatedButtons });
    };

    const isDisabled = isPending || isDeleting || isSending;
    const sendToDiscordIsDisabled = isPending || isDeleting || isSending || isDirty || isEmpty;
    const isSent = !!config.message_id && config.message_id.trim() !== "";

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <p className="font-semibold text-lg">Configure {config.name}</p>
                </div>
                <div className="flex items-center gap-2">
                    {isSent ? (
                        <button
                            type="button"
                            disabled={isDisabled}
                            onClick={handleDeleteDiscordMessage}
                            className="px-4 py-2 text-sm font-medium cursor-pointer rounded transition flex items-center gap-1.5 border-red-500/80 border hover:bg-red-300/10 disabled:opacity-50"
                        >
                            {isActionPending ? "Deleting message..." : "Delete Discord Message"}
                        </button>
                    ) : (
                        <button
                            type="button"
                            disabled={sendToDiscordIsDisabled}
                            onClick={handleSend}
                            className={`px-4 py-2 text-sm font-medium cursor-pointer rounded transition flex items-center gap-1.5 ${
                                sendToDiscordIsDisabled
                                    ? "bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-not-allowed opacity-60"
                                    : "border-neutral-500 border hover:bg-neutral-300/15 disabled:opacity-50"
                            }`}
                            title={sendToDiscordIsDisabled ? "Save changes first to enable sending" : "Publish to Discord"}
                        >
                            {isActionPending ? "Sending..." : "Send to Discord"}
                        </button>
                    )}

                    <button
                        type="button"
                        disabled={isDisabled}
                        onClick={() => handleDelete(config.id)}
                        className="px-4 py-2 text-sm cursor-pointer border-red-500/80 border hover:bg-red-300/10 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isDeleting ? "Deleting..." : "Delete Reaction Role"}
                    </button>
                </div>
            </div>

            {/* Core Settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="block text-sm font-medium">Channel</label>
                    <Dropdown
                        options={Object.entries(channelMap).map(([id, name]) => ({
                            value: id,
                            label: `#${name}`,
                        }))}
                        value={config.channel_id ? String(config.channel_id) : ""}
                        onChange={(val) => onChange({ ...config, channel_id: val })}
                        placeholder="Select channel..."
                        className="w-full"
                    />
                </div>

                <div className="space-y-2">
                    <label className="block text-sm font-medium">Interaction Mode</label>
                    <Dropdown
                        options={[
                            { value: "REACTION", label: "Reaction Emojis" },
                            { value: "BUTTON", label: "Buttons" },
                        ]}
                        value={config.mode || "reaction"}
                        onChange={(val) => onChange({ ...config, mode: val as ReactionRoleMode })}
                        placeholder="Select mode..."
                        className="w-full"
                    />
                </div>
            </div>

            {config.mode === "BUTTON" ? (
                <div className="space-y-3 pt-4 border-t border-neutral-800">
                    <div>
                        <h3 className="text-md font-semibold">Button Mappings</h3>
                        <p className="text-xs text-neutral-400">
                            Configure buttons that grant roles to users when clicked. At least a Label or Emoji is
                            required. </p>
                    </div>

                    <div className="space-y-4">
                        {buttons.map((button, index) => (
                            <div
                                key={index} className="p-4 rounded border border-neutral-500 space-y-3"
                            >
                                <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                                    <span className="text-xs font-semibold text-neutral-400">Button #{index + 1}</span>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveButton(index)}
                                        className="p-1.5 text-red-500 hover:bg-red-500/10 rounded transition cursor-pointer"
                                        title="Remove Button"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                            />
                                        </svg>
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium mb-1">Label</label>
                                        <TextInput
                                            disableSubmitButton
                                            placeholder="Label text"
                                            value={button.label || ""}
                                            onChange={(e) => handleUpdateButton(index, "label", e.target.value)}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium mb-1">Emoji (Optional)</label>
                                        <TextInput
                                            disableSubmitButton
                                            placeholder="😀"
                                            value={button.emoji || ""}
                                            onChange={(e) => handleUpdateButton(index, "emoji", e.target.value)}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium mb-1">Style</label>
                                        <Dropdown
                                            options={[
                                                { value: "PRIMARY", label: "Primary (Blue)" },
                                                { value: "SECONDARY", label: "Secondary (Gray)" },
                                                { value: "SUCCESS", label: "Success (Green)" },
                                                { value: "DANGER", label: "Danger (Red)" },
                                            ]}
                                            value={button.style || "PRIMARY"}
                                            onChange={(val) => handleUpdateButton(index, "style", val)}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium mb-1">Role</label>
                                        {roleMap ? (
                                            <Dropdown
                                                options={Object.entries(roleMap).map(([id, name]) => ({
                                                    value: id,
                                                    label: name,
                                                }))}
                                                value={button.role_id}
                                                onChange={(val) => handleUpdateButton(index, "role_id", val)}
                                                placeholder="Select role..."
                                            />
                                        ) : (
                                            <input
                                                type="text"
                                                placeholder="Paste Role ID"
                                                value={button.role_id}
                                                onChange={(e) => handleUpdateButton(index, "role_id", e.target.value)}
                                                className="w-full border rounded px-2 py-1.5 text-sm"
                                            />
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <span
                                        className="text-[10px] text-neutral-500 font-mono"
                                    >ID: {button.custom_id}</span>
                                    <button
                                        type="button"
                                        className="text-[10px] text-neutral-400 hover:underline cursor-pointer"
                                        onClick={() => {
                                            const newCustomId = prompt("Enter a unique custom ID for this button (must start with `btn_`):", button.custom_id);
                                            if (newCustomId && newCustomId.trim()) {
                                                handleUpdateButton(index, "custom_id", newCustomId.trim());
                                            }
                                        }}
                                    >
                                        Edit ID
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={handleAddButton}
                        className="text-xs px-3 py-1.5 border border-neutral-500 rounded transition cursor-pointer flex items-center gap-1 hover:bg-neutral-300/15"
                    >
                        <span className="text-sm font-semibold">+</span> Add Button
                    </button>
                </div>
            ) : (
                <div className="space-y-3 pt-4 border-t border-neutral-800">
                    <div>
                        <h3 className="text-md font-semibold">Reaction Mappings</h3>
                        <p className="text-xs text-neutral-400">
                            Assign which roles are given to users when they click a specific emoji. </p>
                    </div>

                    <div className="space-y-2">
                        {reactions.map((reaction, index) => (
                            <div
                                key={index}
                                className="flex items-end gap-3 p-3 rounded border border-neutral-500 bg-neutral-900/20"
                            >
                                <div className="w-24">
                                    <label className="block text-xs font-medium mb-1">Emoji</label>
                                    <input
                                        type="text"
                                        placeholder="😀"
                                        value={reaction.emoji}
                                        onChange={(e) => handleUpdateReaction(index, "emoji", e.target.value)}
                                        className="w-full border-neutral-500 border rounded px-4 py-2 text-sm text-center bg-neutral-300/10"
                                    />
                                </div>

                                <div className="flex-1">
                                    <label className="block text-xs font-medium mb-1">Role</label>
                                    {roleMap ? (
                                        <Dropdown
                                            options={Object.entries(roleMap).map(([id, name]) => ({
                                                value: id,
                                                label: name,
                                            }))}
                                            value={reaction.role_id}
                                            onChange={(val) => handleUpdateReaction(index, "role_id", val)}
                                            placeholder="Select role..."
                                        />
                                    ) : (
                                        <input
                                            type="text"
                                            placeholder="Paste Role ID"
                                            value={reaction.role_id}
                                            onChange={(e) => handleUpdateReaction(index, "role_id", e.target.value)}
                                            className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm"
                                        />
                                    )}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => handleRemoveReaction(index)}
                                    className="p-2 text-red-500 hover:bg-red-500/10 rounded transition cursor-pointer"
                                    title="Remove Mapping"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                        />
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>

                    <SecondaryButton onClick={handleAddReaction}>+ Add Mapping</SecondaryButton>
                </div>
            )}

            <div className="pt-4 border-t border-neutral-800">
                <MessageConfigEditor
                    config={config} onChange={(v) => onChange({
                    ...config,
                    channel_id: v.channel_id || "",
                    content: v.content ?? "",
                    embed: v.embed ?? {},
                    format: v.format,
                })} onEmbedChange={(v) => onChange({
                    ...config,
                    embed: v,
                })} embedTemplateConfig={REACTION_ROLES_CONFIG} setIsEmpty={setIsEmpty} enableToggle={false}
                />
            </div>
        </div>
    );
}