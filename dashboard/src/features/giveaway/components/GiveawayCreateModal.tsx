"use client";

import React, { ReactNode, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { Dropdown } from "@/components/ui/Dropdown";
import { TextInput } from "@/components/ui/TextInput";
import { InputLabel } from "@/components/layout/InputLabel";
import { Giveaway } from "@/features/giveaway/types";

interface GiveawayCreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (ruleset: Partial<Giveaway>) => Promise<Giveaway>;
    channelMap: Record<string, string>;
}

export function GiveawayCreateModal({
    isOpen,
    onClose,
    onSave,
    channelMap,
}: GiveawayCreateModalProps): ReactNode | null {
    const router = useRouter();
    const params = useParams();
    const guildId = params?.guild_id;

    const [isPending, startTransition] = useTransition();
    const [channelId, setChannelId] = useState("");
    const [prize, setPrize] = useState("");

    const handleSubmit = (e: React.FormEvent): void => {
        e.preventDefault();
        if (!channelId || !prize) {
            alert("Please fill in all fields.");
            return;
        }

        startTransition(async () => {
            try {
                // Default end time to 24 hours from now
                const defaultEndTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

                const newConfig = await onSave({
                    channel_id: channelId,
                    prize,
                    winner_count: 1,
                    end_time: defaultEndTime,
                    format: "TEXT",
                });

                onClose();
                if (newConfig?.id) {
                    router.push(`/dashboard/${guildId}/giveaways?id=${newConfig.id}`);
                }
            } catch {
                alert("Failed to create giveaway.");
            }
        });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-black border border-zinc-800 p-6 rounded-lg w-full max-w-md shadow-2xl space-y-6">
                <div>
                    <h3 className="text-lg font-medium">Create New Giveaway</h3>
                    <p className="text-xs text-neutral-400">Set basic initial giveaway info.</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <InputLabel>Prize</InputLabel>
                        <TextInput
                            value={prize}
                            onChange={(e) => setPrize(e.target.value)}
                            placeholder="e.g. 1 Month Nitro"
                        />
                    </div>
                    <div className="space-y-2">
                        <InputLabel>Destination Channel</InputLabel>
                        <Dropdown
                            options={Object.entries(channelMap).map(([id, cName]) => ({
                                value: id,
                                label: `#${cName}`,
                            }))} value={channelId} onChange={setChannelId} placeholder="Choose channel..."
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-neutral-500 hover:text-neutral-300 rounded"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isPending}
                            className="px-4 py-2 text-sm border font-semibold rounded hover:bg-neutral-300/20"
                        >
                            {isPending ? "Creating..." : "Create"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}