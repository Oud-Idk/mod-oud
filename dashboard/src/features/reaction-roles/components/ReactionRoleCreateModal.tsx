"use client";

import React, { useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { Dropdown } from "@/components/ui/Dropdown";
import { TextInput } from "@/components/ui/TextInput";
import { Modal } from "@/components/ui/Modal"; // Adjust path to match your directory
import { ReactionMessage } from "@/features/reaction-roles/types";

interface ReactionRoleCreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (ruleset: Partial<ReactionMessage>) => Promise<ReactionMessage>;
    channelMap: Record<string, string>;
}

export function ReactionRoleCreateModal({
    isOpen,
    onClose,
    onSave,
    channelMap,
}: ReactionRoleCreateModalProps) {
    const router = useRouter();
    const params = useParams();
    const guildId = params?.guild_id as string;

    const [isPending, startTransition] = useTransition();
    const [modalChannelId, setModalChannelId] = useState("");
    const [modalName, setModalName] = useState("");

    const handleCreateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!modalChannelId) {
            alert("Please choose a channel first.");
            return;
        }

        if (!modalName) {
            alert("Please type in a name.");
            return;
        }

        startTransition(async () => {
            try {
                const newConfig = await onSave({
                    channel_id: modalChannelId,
                    name: modalName,
                });

                onClose();
                setModalChannelId("");
                setModalName("");

                if (newConfig?.id) {
                    router.push(`/dashboard/${guildId}/reaction-roles?id=${newConfig.id}`);
                }
            } catch (err) {
                alert("Failed to create reaction role.");
            }
        });
    };

    if (!isOpen) return null;

    return (
        <Modal
            onClose={onClose}
            headerText="Create New Reaction Role"
            className="max-w-md"
        >
            <form onSubmit={handleCreateSubmit} className="space-y-4">
                <p className="text-xs text-muted-foreground -mt-1">
                    Select target destination channel.
                </p>

                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Destination Channel</label>
                    <Dropdown
                        options={Object.entries(channelMap).map(([id, name]) => ({
                            value: id,
                            label: `#${name}`,
                        }))}
                        value={modalChannelId}
                        onChange={setModalChannelId}
                        placeholder="Choose channel..."
                    />
                </div>

                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Reaction Role Name</label>
                    <TextInput
                        value={modalName}
                        onChange={e => setModalName(e.target.value)}
                        placeholder="Enter Reaction Role Name"
                    />
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-border-subtle">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-semibold rounded-md bg-surface-active hover:bg-surface-muted text-foreground border border-border-subtle transition-all cursor-pointer"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isPending}
                        className="px-4 py-2 text-sm font-semibold rounded-md bg-brand hover:bg-brand-hover text-brand-foreground transition-all disabled:opacity-50 cursor-pointer"
                    >
                        {isPending ? "Creating..." : "Create"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}