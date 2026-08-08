"use client";

import React, { ReactNode, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Dropdown } from "@/components/ui/Dropdown";
import { TextInput } from "@/components/ui/TextInput";
import { InputLabel } from "@/components/layout/InputLabel";
import type { Giveaway } from "../types";
import { Button } from "@/components/ui/Button";

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

    if (!isOpen) return null;

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

    return (
        <Modal headerText="Create New Giveaway" onClose={onClose}>
            <p className="-mt-2 mb-4 text-xs text-muted-foreground">
                Set basic initial giveaway info.
            </p>

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
                        }))}
                        value={channelId}
                        onChange={(val) => setChannelId(val ?? "")}
                        placeholder="Choose channel..."
                    />
                </div>

                {/* Footer buttons using proper palette tokens */}
                <div className="flex justify-end gap-3 pt-4">
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button disabled={isPending} type="submit">
                        {isPending ? "Creating..." : "Create"}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}