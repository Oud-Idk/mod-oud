import React, { useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { Dropdown } from "@/components/Inputs/Dropdown";
import { TextInput } from "@/components/Inputs/TextInput";
import { ReactionMessage } from "@/types/db/reactionRole";

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

    const handleCreateSubmit = (e: React.SubmitEvent) => {
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div
                className="bg-white dark:bg-black border border-zinc-800 p-6 rounded-lg w-full max-w-md shadow-2xl space-y-6">
                <div>
                    <h3 className="text-lg font-medium">Create New Reaction Role</h3>
                    <p className="text-xs">Select target destination channel.</p>
                </div>
                <form onSubmit={handleCreateSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <label className="block text-sm font-medium">Destination Channel</label>
                        <Dropdown
                            options={Object.entries(channelMap).map(([id, name]) => ({
                                value: id,
                                label: `#${name}`,
                            }))} value={modalChannelId} onChange={setModalChannelId} placeholder="Choose channel..."
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-sm font-medium">Reaction Role Name</label>
                        <TextInput
                            disableSubmitButton
                            value={modalName}
                            onChange={e => setModalName(e.target.value)}
                            placeholder="Enter Reaction Role Name"
                            parentClassName="max-w-none"
                        />
                    </div>

                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-300/10 transition cursor-pointer rounded"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isPending}
                            className="px-4 py-2 text-sm hover:bg-neutral-300/20 font-semibold rounded transition disabled:opacity-50 cursor-pointer border"
                        >
                            {isPending ? "Creating..." : "Create"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}