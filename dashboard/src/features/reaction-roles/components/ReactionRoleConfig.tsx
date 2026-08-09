"use client";

import React, { JSX, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dropdown } from "@/components/ui/Dropdown";
import { TextInput } from "@/components/ui/TextInput";
import { Button } from "@/components/ui/Button";
import { InputLabel } from "@/components/layout/InputLabel";
import { REACTION_ROLES_CONFIG } from "@/features/reaction-roles/builderConfigs";
import { MessageConfigEditor } from "@/features/_shared/message-creator/components/MessageConfigEditor";
import { getAvailableChannelOptions, getAvailableRoleOptions } from "@/features/_shared/dropdown";
import { saveReactionMessageInputSchema } from "../types";
import { toast } from "sonner";

import type {
    ReactionMessage,
    ReactionRoleItem,
    ButtonRoleItem,
} from "../types";

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
    onDeleteDiscordMessage: (id: number) => Promise<{ success: boolean }>;
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
    onDeleteDiscordMessage,
}: ReactionRoleConfigProps): JSX.Element {
    const router = useRouter();
    const [isDeleting, setIsDeleting] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [isActionPending, setIsActionPending] = useState(false);

    const reactions = config.reactions ?? [];
    const buttons = config.buttons ?? [];

    const validationResult = useMemo(() => {
        return saveReactionMessageInputSchema.safeParse(config);
    }, [config]);

    const hasValidationErrors = !validationResult.success;

    const handleDelete = async (id: number): Promise<void> => {
        setIsDeleting(true);
        try {
            await onDelete(id);
            toast.success("Reaction role deleted successfully");
            router.push(`/dashboard/${guildId}/reaction-roles`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to delete configuration.");
            setIsDeleting(false);
        }
    };

    const handleSend = async (): Promise<void> => {
        if (isDirty) {
            toast.error("Please save your changes before sending the message to Discord.");
            return;
        }
        if (hasValidationErrors) {
            const firstErr = validationResult.error?.issues[0]?.message || "Invalid configuration.";
            toast.error(`Cannot send to Discord: ${firstErr}`);
            return;
        }
        setIsSending(true);
        try {
            await onSend(config.id);
            toast.success("Message sent to Discord successfully");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to send message to Discord.");
        } finally {
            setIsSending(false);
        }
    };

    const handleAddReaction = (): void => {
        const updatedReactions: ReactionRoleItem[] = [
            ...reactions,
            { emoji: "", role_id: null },
        ];
        onChange({ ...config, reactions: updatedReactions });
    };

    const handleUpdateReaction = (
        index: number,
        key: keyof ReactionRoleItem,
        value: string | null
    ): void => {
        const updatedReactions = reactions.map((r, idx) => {
            if (idx === index) {
                return { ...r, [key]: value };
            }
            return r;
        });
        onChange({ ...config, reactions: updatedReactions });
    };

    const handleRemoveReaction = (index: number): void => {
        const updatedReactions = reactions.filter((_, idx) => idx !== index);
        onChange({ ...config, reactions: updatedReactions });
    };

    const handleAddButton = (): void => {
        const uniqueId = `btn_${Math.random().toString(36).substring(2, 9)}`;
        const updatedButtons: ButtonRoleItem[] = [
            ...buttons,
            { role_id: null, custom_id: uniqueId, label: "Get Role", style: "PRIMARY" },
        ];
        onChange({ ...config, buttons: updatedButtons });
    };

    const handleUpdateButton = (
        index: number,
        key: keyof ButtonRoleItem,
        value: string | null
    ): void => {
        const updatedButtons = buttons.map((b, idx) => {
            if (idx === index) {
                return { ...b, [key]: value };
            }
            return b;
        });
        onChange({ ...config, buttons: updatedButtons });
    };

    const handleRemoveButton = (index: number): void => {
        const updatedButtons = buttons.filter((_, idx) => idx !== index);
        onChange({ ...config, buttons: updatedButtons });
    };

    const handleDeleteDiscordMessage = async (): Promise<void> => {
        setIsActionPending(true);
        try {
            await onDeleteDiscordMessage(config.id);
            onChange({ ...config, message_id: null });
            toast.success("Discord message deleted successfully");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to delete message from Discord.");
        } finally {
            setIsActionPending(false);
        }
    };

    const isDisabled = isPending || isDeleting || isSending;
    const sendToDiscordIsDisabled = isDisabled || isDirty || hasValidationErrors;
    const isSent = Boolean(config.message_id && config.message_id.trim() !== "");

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <h3 className="font-bold text-lg text-foreground">Configure {config.name}</h3>
                </div>
                <div className="flex items-center gap-2">
                    {isSent ? (
                        <Button
                            disabled={isDisabled}
                            onClick={handleDeleteDiscordMessage}
                        >
                            {isActionPending ? "Deleting message..." : "Delete Discord Message"}
                        </Button>
                    ) : (
                        <Button
                            disabled={sendToDiscordIsDisabled}
                            onClick={handleSend}
                        >
                            {isSending ? "Sending..." : "Send to Discord"}
                        </Button>
                    )}

                    <Button
                        variant="danger"
                        disabled={isDisabled}
                        onClick={() => handleDelete(config.id)}
                    >
                        {isDeleting ? "Deleting..." : "Delete Reaction Role"}
                    </Button>
                </div>
            </div>

            {hasValidationErrors && (
                <div className="p-3 rounded-lg border border-warning/30 bg-warning-subtle text-warning-foreground text-xs font-medium flex items-center gap-2">
                    <span>⚠️</span>
                    <span>
                        {validationResult.error?.issues[0]?.message || "All channel and role mappings must be configured before saving."}
                    </span>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className="block text-sm font-semibold text-foreground">Channel</label>
                    <Dropdown
                        options={getAvailableChannelOptions(channelMap)}
                        value={config.channel_id ?? ""}
                        onChange={(val) => onChange({ ...config, channel_id: val })}
                        placeholder="Select channel..."
                        className="w-full"
                    />
                </div>

                <div className="space-y-1.5">
                    <label className="block text-sm font-semibold text-foreground">Interaction Mode</label>
                    <Dropdown
                        options={[
                            { value: "REACTION", label: "Reaction Emojis" },
                            { value: "BUTTON", label: "Buttons" },
                        ]}
                        value={config.mode || "REACTION"}
                        onChange={(val) => {
                            if (val === "REACTION" || val === "BUTTON") {
                                onChange({ ...config, mode: val });
                            }
                        }}
                        placeholder="Select mode..."
                        className="w-full"
                    />
                </div>
            </div>

            {config.mode === "BUTTON" ? (
                <div className="space-y-3 pt-4 border-t border-border-subtle">
                    <div>
                        <h4 className="text-md font-bold text-foreground">Button Mappings</h4>
                        <p className="text-xs text-muted-foreground">
                            Configure buttons that grant roles to users when clicked. At least a Label or Emoji is required.
                        </p>
                    </div>

                    <div className="space-y-2">
                        {buttons.map((button, index) => (
                            <div
                                key={button.custom_id || index}
                                className="bg-surface border border-border-subtle rounded-lg p-4 space-y-3 transition hover:border-border"
                            >
                                <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                                    <span className="text-xs font-semibold text-muted-foreground">
                                        Button #{index + 1}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveButton(index)}
                                        className="p-1.5 text-danger hover:bg-danger-subtle rounded transition cursor-pointer"
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
                                    <div className="space-y-1">
                                        <label className="block text-xs font-semibold text-foreground">Label</label>
                                        <TextInput
                                            placeholder="Label text"
                                            value={button.label || ""}
                                            onChange={(e) => handleUpdateButton(index, "label", e.target.value)}
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="block text-xs font-semibold text-foreground">Emoji (Optional)</label>
                                        <TextInput
                                            placeholder="😀"
                                            value={button.emoji || ""}
                                            onChange={(e) => handleUpdateButton(index, "emoji", e.target.value)}
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="block text-xs font-semibold text-foreground">Style</label>
                                        <Dropdown
                                            options={[
                                                { value: "PRIMARY", label: "Primary (Blue)" },
                                                { value: "SECONDARY", label: "Secondary (Gray)" },
                                                { value: "SUCCESS", label: "Success (Green)" },
                                                { value: "DANGER", label: "Danger (Red)" },
                                            ]}
                                            value={button.style || "PRIMARY"}
                                            onChange={(val) => handleUpdateButton(index, "style", val ?? "PRIMARY")}
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="block text-xs font-semibold text-foreground">Role</label>
                                        <Dropdown
                                            options={getAvailableRoleOptions(roleMap)}
                                            value={button.role_id ?? ""}
                                            onChange={(val) => handleUpdateButton(index, "role_id", val)}
                                            placeholder="Select role..."
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-muted-foreground font-mono">
                                        ID: {button.custom_id}
                                    </span>
                                    <button
                                        type="button"
                                        className="text-[10px] text-brand hover:text-brand-hover hover:underline cursor-pointer"
                                        onClick={() => {
                                            const newCustomId = prompt(
                                                "Enter a unique custom ID for this button (must start with `btn_`):",
                                                button.custom_id
                                            );
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

                    <Button
                        variant="secondary"
                        onClick={handleAddButton}
                    >
                        + Add Button
                    </Button>
                </div>
            ) : (
                <div className="space-y-3 pt-4 border-t border-border-subtle">
                    <div>
                        <h4 className="text-md font-bold text-foreground">Reaction Mappings</h4>
                        <p className="text-xs text-muted-foreground">
                            Assign which roles are given to users when they click a specific emoji.
                        </p>
                    </div>

                    <div className="space-y-2">
                        {reactions.map((reaction, index) => (
                            <div
                                key={index}
                                className="flex items-end gap-3 p-3 rounded-lg border border-border-subtle bg-surface-muted/30"
                            >
                                <div>
                                    <InputLabel className="mt-0">Emoji</InputLabel>
                                    <TextInput
                                        placeholder="😀"
                                        value={reaction.emoji}
                                        onChange={(e) => handleUpdateReaction(index, "emoji", e.target.value)}
                                        className="text-center w-20"
                                    />
                                </div>

                                <div className="flex-1 space-y-1">
                                    <InputLabel className="mt-0">Role</InputLabel>
                                    <Dropdown
                                        options={getAvailableRoleOptions(roleMap)}
                                        value={reaction.role_id ?? ""}
                                        onChange={(val) => handleUpdateReaction(index, "role_id", val)}
                                        placeholder="Select role..."
                                    />
                                </div>

                                <Button
                                    type="button"
                                    onClick={() => handleRemoveReaction(index)}
                                    className="p-2 border-none"
                                    variant="danger"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                        />
                                    </svg>
                                </Button>
                            </div>
                        ))}
                    </div>

                    <Button
                        variant="secondary"
                        onClick={handleAddReaction}
                    >
                        + Add Mapping
                    </Button>
                </div>
            )}

            <div className="pt-4 border-t border-border-subtle">
                <MessageConfigEditor
                    config={config.message}
                    onChange={(v) =>
                        onChange({
                            ...config,
                            channel_id: v.channel_id || null,
                            message: {
                                content: v.content ?? "",
                                embed: v.embed ?? {},
                                format: v.format,
                            }
                        })
                    }
                    embedTemplateConfig={REACTION_ROLES_CONFIG}
                    enableToggle={false}
                />
            </div>
        </div>
    );
}