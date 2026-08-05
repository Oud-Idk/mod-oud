"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dropdown } from "@/components/ui/Dropdown";
import { NumberInput } from "@/components/ui/NumberInput";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { InputLabel } from "@/components/layout/InputLabel";
import { StarboardConfigInput } from "@/features/starboard/types";

interface StarboardCreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    channelMap: Record<string, string>;
    onSave: (config: StarboardConfigInput) => Promise<string>;
    guildId: string;
}

export function StarboardCreateModal({
    isOpen,
    onClose,
    channelMap,
    onSave,
    guildId,
}: StarboardCreateModalProps) {
    const router = useRouter();

    const [isPending, startTransition] = useTransition();
    const [modalChannelId, setModalChannelId] = useState("");
    const [modalThreshold, setModalThreshold] = useState(3);

    const handleCreateSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
        e.preventDefault();
        if (!modalChannelId) {
            return;
        }

        startTransition(async () => {
            try {
                const id = await onSave({
                    starboard_channel_id: modalChannelId,
                    reaction_threshold: modalThreshold,
                    embed_template: {
                        color: 15591782,
                        author: {
                            name: "{member.mention}",
                            icon_url: "{member.avatar_url}",
                        },
                        description: "{message.text}",
                        image: {
                            url: "{message.first_attachment}",
                        },
                    },
                    plaintext_template: "{starboard.first_emoji} {message.stars_count} | {message.link}",
                });

                onClose();
                setModalChannelId("");
                setModalThreshold(3);

                if (id) {
                    router.push(`/dashboard/${guildId}/starboard?id=${id}`);
                }
            } catch {
                alert("Failed to create starboard.");
            }
        });
    };

    if (!isOpen) return null;

    return (
        <Modal onClose={onClose} headerText="Create New Starboard" className="max-w-md">
            <form onSubmit={handleCreateSubmit} className="space-y-2">
                <div>
                    <InputLabel required>Destination Channel</InputLabel>
                    <Dropdown
                        options={Object.entries(channelMap).map(([id, name]) => ({
                            value: id,
                            label: `#${name}`,
                        }))}
                        value={modalChannelId}
                        onChange={setModalChannelId}
                        placeholder="Choose channel..."
                    />
                    {!modalChannelId && (
                        <p className="text-xs text-danger font-medium pt-0.5">
                            Please select a destination channel to continue.
                        </p>
                    )}
                </div>

                <div className="space-y-1.5">
                    <InputLabel required>Initial Star Threshold</InputLabel>
                    <NumberInput
                        value={modalThreshold}
                        onChange={(v) => setModalThreshold(v ?? 1)}
                        min={1}
                    />
                </div>

                {/* Footer Action Row */}
                <div className="flex justify-end gap-3 pt-4 border-t border-border-subtle mt-6">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={onClose}
                        disabled={isPending}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        disabled={isPending || !modalChannelId}
                    >
                        {isPending ? "Creating..." : "Create"}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}