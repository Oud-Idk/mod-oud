"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dropdown } from "@/components/ui/Dropdown";
import { TextInput } from "@/components/ui/TextInput";
import { Modal } from "@/components/ui/Modal";
import { getAvailableChannelOptions } from "@/features/_shared/dropdown";
import type { ReactionMessage } from "../types";

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
    const [isPending, startTransition] = useTransition();
    const [modalChannelId, setModalChannelId] = useState<string | null>(null);
    const [modalName, setModalName] = useState("");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const handleCreateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);

        if (!modalChannelId) {
            setErrorMessage("Please choose a target channel.");
            return;
        }

        if (!modalName.trim()) {
            setErrorMessage("Please enter a configuration name.");
            return;
        }

        startTransition(async () => {
            try {
                const newConfig = await onSave({
                    channel_id: modalChannelId,
                    name: modalName.trim(),
                });

                onClose();
                setModalChannelId(null);
                setModalName("");

                if (newConfig?.id && newConfig?.guild_id) {
                    router.push(`/dashboard/${newConfig.guild_id}/reaction-roles?id=${newConfig.id}`);
                }
            } catch (err) {
                setErrorMessage(err instanceof Error ? err.message : "Failed to create reaction role.");
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
                    Select target destination channel and set a internal configuration name.
                </p>

                {errorMessage && (
                    <div className="p-2.5 rounded-md border border-danger/30 bg-danger-subtle text-danger-foreground text-xs font-medium">
                        {errorMessage}
                    </div>
                )}

                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Destination Channel</label>
                    <Dropdown
                        options={getAvailableChannelOptions(channelMap)}
                        value={modalChannelId ?? ""}
                        onChange={(val) => setModalChannelId(val ?? null)}
                        placeholder="Choose channel..."
                    />
                </div>

                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Reaction Role Name</label>
                    <TextInput
                        value={modalName}
                        onChange={(e) => setModalName(e.target.value)}
                        placeholder="e.g. Self Roles"
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