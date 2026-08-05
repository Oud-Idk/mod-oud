"use client";

import React, { ReactNode, SetStateAction, useState } from "react";
import { useRouter } from "next/navigation";
import { Dropdown } from "@/components/ui/Dropdown";
import { TextInput } from "@/components/ui/TextInput";
import { Giveaway } from "@/features/giveaway/types";
import { NumberInput } from "@/components/ui/NumberInput";
import { GIVEAWAY_TEMPLATE_CONFIG } from "@/features/giveaway/builderConfigs";
import { MessageConfigEditor } from "@/features/_shared/message-creator/components/MessageConfigEditor";

interface GiveawayConfigProps {
    config: Giveaway;
    channelMap: Record<string, string>;
    isPending: boolean;
    isDirty: boolean;
    isEmpty: boolean;
    guildId: string;
    onDelete: (id: number) => Promise<boolean>;
    onSend: (id: number) => Promise<{ message_id: string }>;
    onChange: (updated: Giveaway) => void;
    setIsEmpty: (isEmpty: SetStateAction<boolean>) => void;
    onDeleteDiscordMessage: (id: number) => Promise<void>;
}

export function GiveawayConfig({
    config,
    isPending,
    isDirty,
    isEmpty,
    channelMap,
    guildId,
    onDelete,
    onSend,
    onChange,
    setIsEmpty,
    onDeleteDiscordMessage,
}: GiveawayConfigProps): ReactNode {
    const router = useRouter();
    const [isDeleting, setIsDeleting] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [isActionPending, setIsActionPending] = useState(false);

    const isSent = !!config.message_id && config.message_id.trim() !== "";
    const isDisabled = isPending || isDeleting || isSending;
    const sendToDiscordIsDisabled = isDisabled || isDirty || isEmpty;

    const handleDelete = (id: number): void => {
        setIsDeleting(true);
        onDelete(id)
            .then(() => router.push(`/dashboard/${guildId}/giveaways`))
            .catch(() => {
                alert("Failed to delete giveaway configuration.");
                setIsDeleting(false);
            });
    };

    const handleSend = (): void => {
        if (isDirty) {
            alert("Please save your changes before starting the giveaway.");
            return;
        }
        setIsSending(true);
        onSend(config.id)
            .catch((err) => alert(err.message || "Failed to launch giveaway."))
            .finally(() => setIsSending(false));
    };

    const handleDeleteDiscordMessage = (): void => {
        setIsActionPending(true);
        onDeleteDiscordMessage(config.id)
            .then(() => onChange({ ...config, message_id: undefined }))
            .catch((err) => alert(err.message || "Failed to delete message."))
            .finally(() => setIsActionPending(false));
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="font-semibold text-lg">Configure {config.prize}</p>
                <div className="flex items-center gap-2">
                    {isSent ? (
                        <button
                            type="button"
                            disabled={isDisabled || isActionPending}
                            onClick={handleDeleteDiscordMessage}
                            className="px-4 py-2 text-sm font-medium cursor-pointer rounded transition border-red-500/80 border hover:bg-red-300/10 disabled:opacity-50"
                        >
                            {isActionPending ? "Deleting..." : "Delete Discord Message"}
                        </button>
                    ) : (
                        <button
                            type="button"
                            disabled={sendToDiscordIsDisabled}
                            onClick={handleSend}
                            className={`px-4 py-2 text-sm font-medium cursor-pointer rounded transition ${
                                sendToDiscordIsDisabled
                                    ? "bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-not-allowed opacity-60"
                                    : "border-neutral-500 border hover:bg-neutral-300/15"
                            }`}
                        >
                            {isSending ? "Launching..." : "Launch Giveaway"}
                        </button>
                    )}

                    <button
                        type="button"
                        disabled={isDisabled}
                        onClick={() => handleDelete(config.id)}
                        className="px-4 py-2 text-sm cursor-pointer border-red-500/80 border hover:bg-red-300/10 rounded transition disabled:opacity-50"
                    >
                        {isDeleting ? "Deleting..." : "Delete Config"}
                    </button>
                </div>
            </div>

            {/* Core Settings */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                    <label className="block text-sm font-medium">Destination Channel</label>
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
                    <label className="block text-sm font-medium">Prize</label>
                    <TextInput
                        placeholder="e.g. 1 Month Nitro"
                        value={config.prize || ""}
                        onChange={(e) => onChange({ ...config, prize: e.target.value })}
                    />
                </div>

                <div className="space-y-2">
                    <label className="block text-sm font-medium">Winner Count</label>
                    <NumberInput
                        placeholder="1"
                        value={config.winner_count || 1}
                        onChange={(e) => onChange({ ...config, winner_count: e || 1 })}
                    />
                </div>
            </div>

            <div className="space-y-2">
                <label className="block text-sm font-medium">End Time (UTC)</label>
                <input
                    type="datetime-local"
                    value={config.end_time ? new Date(config.end_time).toISOString().slice(0, 16) : ""}
                    onChange={(e) => onChange({ ...config, end_time: new Date(e.target.value).toISOString() })}
                    className="bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-sm text-white w-full max-w-xs"
                />
            </div>

            {/* Embed / Custom Message Config */}
            <div className="pt-4 border-t border-neutral-800">
                <MessageConfigEditor
                    config={config}
                    onChange={(v) => onChange({
                        ...config,
                        channel_id: v.channel_id || config.channel_id,
                        content: v.content ?? "",
                        embed: v.embed ?? {},
                        format: v.format,
                    })}
                    onEmbedChange={(v) => onChange({ ...config, embed: v })}
                    embedTemplateConfig={GIVEAWAY_TEMPLATE_CONFIG}
                    setIsEmpty={setIsEmpty}
                    enableToggle={false}
                />
            </div>
        </div>
    );
}