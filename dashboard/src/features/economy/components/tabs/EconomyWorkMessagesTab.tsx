"use client";

import React, { JSX, useState, useTransition, useEffect } from "react";
import { InputLabel } from "@/components/layout/InputLabel";
import { Button } from "@/components/ui/inputs/Button";
import { LongTextInput } from "@/components/ui/inputs/LongTextInput";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { isDeepEqual } from "@/features/_shared/embed";
import { toast } from "sonner";
import { EconomyWorkMessage } from "@/features/economy/types";

interface EconomyWorkMessagesTabProps {
    messages: EconomyWorkMessage[];
    onSync: (messages: EconomyWorkMessage[]) => Promise<EconomyWorkMessage[]>;
}

export function EconomyWorkMessagesTab({
    messages,
    onSync,
}: EconomyWorkMessagesTabProps): JSX.Element {
    const [localMessages, setLocalMessages] = useState<EconomyWorkMessage[]>(messages);
    const [newContent, setNewContent] = useState("");
    const [isPending, startTransition] = useTransition();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingContent, setEditingContent] = useState("");

    useEffect(() => {
        setLocalMessages((prev) => {
            // Preserve dirty local edits across revalidation (like EconomyItemsTab)
            // If we already have unsaved changes, keep them; only sync on initial load or when not dirty
            if (prev.length === 0 && messages.length > 0) return messages;
            if (!isDeepEqual(prev, messages)) return prev;
            return messages;
        });
    }, [messages]);

    const isDirty = !isDeepEqual(localMessages, messages);

    // Local add (dirty, no DB)
    const handleAddLocal = (): void => {
        const trimmed = newContent.trim();
        if (trimmed.length < 1 || trimmed.length > 1000) {
            toast.error("Message must be 1–1000 characters.");
            return;
        }
        const newMsg: EconomyWorkMessage = {
            id: crypto.randomUUID(),
            content: trimmed,
        };
        setLocalMessages((prev) => [...prev, newMsg]);
        setNewContent("");
    };

    const handleDeleteLocal = (id: string): void => {
        setLocalMessages((prev) => prev.filter((m) => m.id !== id));
        if (editingId === id) {
            setEditingId(null);
            setEditingContent("");
        }
    };

    const startEdit = (msg: EconomyWorkMessage): void => {
        if (msg.id === undefined || msg.id === "") return;
        setEditingId(msg.id);
        setEditingContent(msg.content);
    };

    const handleUpdateLocal = (): void => {
        if (editingId === null || editingId === "") return;
        const trimmed = editingContent.trim();
        if (trimmed.length < 1 || trimmed.length > 1000) {
            toast.error("Message must be 1–1000 characters.");
            return;
        }
        setLocalMessages((prev) => prev.map((m) => (m.id === editingId ? {
            ...m,
            content: trimmed
        } : m)));
        setEditingId(null);
        setEditingContent("");
    };

    const handleCancel = (): void => {
        setLocalMessages(messages);
        setNewContent("");
        setEditingId(null);
        setEditingContent("");
    };

    const handleSave = (): void => {
        // If inline editor is open, flush it first
        if (editingId !== null && editingId !== "") {
            const trimmed = editingContent.trim();
            if (trimmed.length >= 1 && trimmed.length <= 1000) {
                setLocalMessages((prev) => prev.map((m) => (m.id === editingId ? {
                    ...m,
                    content: trimmed
                } : m)));
            }
        }

        // Capture snapshot to save; use current localMessages + pending editingContent if needed
        const finalMessages = (() => {
            let snapshot = localMessages;
            if (editingId !== null && editingId !== "") {
                const trimmed = editingContent.trim();
                if (trimmed.length >= 1 && trimmed.length <= 1000) {
                    snapshot = snapshot.map((m) => (m.id === editingId ? {
                        ...m,
                        content: trimmed
                    } : m));
                }
            }
            return snapshot;
        })();

        startTransition(async () => {
            try {
                // Single bulk sync: one transaction, one revalidation (fixes N round-trips)
                const synced = await onSync(finalMessages);
                setLocalMessages(synced);
                setNewContent("");
                setEditingId(null);
                setEditingContent("");
                toast.success("Work messages saved");
            } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to save work messages.");
            }
        });
    };

    const preview = (template: string): string => {
        return template
            .replaceAll("{reward}", "2500")
            .replaceAll("{currency}", "coins")
            .replaceAll("{user}", "@You");
    };

    return (
        <div className="space-y-2 pt-2">
            <div>
                <h3 className="text-sm font-semibold text-foreground">Work Messages</h3>
                <p className="text-xs text-muted-foreground mt-1">
                    Plaintext templates shown when a user runs <code
                    className="px-1 py-0.5 bg-surface-muted rounded text-xs">/economy work</code>.
                    One is picked at random. Placeholders:{" "}
                    <code className="px-1 py-0.5 bg-surface-muted rounded">{"{reward}"}</code>{" "}
                    <code
                        className="px-1 py-0.5 bg-surface-muted rounded">{"{currency}"}</code>{" "}
                    <code className="px-1 py-0.5 bg-surface-muted rounded">{"{user}"}</code>. If no
                    messages exist, the fallback template in General Settings is used.
                </p>
            </div>

            {/* New message composer */}
            <div className="flex flex-row justify-between">
                <InputLabel>New Message</InputLabel>
                <Button onClick={handleAddLocal}
                        disabled={isPending || newContent.trim().length === 0}>
                    + Add Message
                </Button>
            </div>
            <LongTextInput
                value={newContent}
                onChange={(e) => { setNewContent(e.target.value); }}
                onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        e.preventDefault();
                        handleAddLocal();
                    }
                }}
                placeholder="e.g. You clocked in and earned {reward} {currency}! Nice work, {user}!"
                rows={3}
                maxLength={1000}
            />

            {/* List */}
            {localMessages.length === 0 ? (
                <div
                    className="p-6 border border-dashed border-border-subtle rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">No custom work messages yet.</p>
                    <p className="text-xs text-muted-foreground mt-1">
                        Default: <span
                        className="text-foreground">You earned **{"{reward}"} {"{currency}"}**!</span> will
                        be used.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {localMessages.map((msg) => (
                        <div
                            key={msg.id ?? msg.content}
                            className="p-3.5 rounded-lg border border-border bg-surface-active/20 space-y-2"
                        >
                            {editingId === msg.id ? (
                                <>
                                    <LongTextInput
                                        value={editingContent}
                                        onChange={(e) => { setEditingContent(e.target.value); }}
                                        onKeyDown={(e) => {
                                            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                                                e.preventDefault();
                                                handleUpdateLocal();
                                            }
                                        }}
                                        rows={2}
                                        maxLength={1000}
                                        autoFocus
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Preview: <span
                                        className="text-foreground">{preview(editingContent)}</span>
                                    </p>
                                    <div className="flex justify-end gap-2">
                                        <Button
                                            variant="secondary"
                                            type="button"
                                            onClick={() => {
                                                setEditingId(null);
                                                setEditingContent("");
                                            }}
                                            disabled={isPending}
                                        >
                                            Cancel
                                        </Button>
                                        <Button onClick={handleUpdateLocal} disabled={isPending}>
                                            Save
                                        </Button>
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-row justify-between">
                                    <div>
                                        <p className="text-sm text-foreground whitespace-pre-wrap wrap-break-word">{msg.content}</p>
                                        <p className="text-xs text-muted-foreground">
                                            Preview: <span
                                            className="italic">{preview(msg.content)}</span>
                                        </p>
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <Button variant="secondary" type="button"
                                                onClick={() => { startEdit(msg); }} disabled={isPending}>
                                            Edit
                                        </Button>
                                        <Button
                                            variant="danger"
                                            type="button"
                                            onClick={() => {
                                                if (msg.id !== undefined && msg.id !== "") handleDeleteLocal(msg.id);
                                            }}
                                            disabled={isPending}
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <p className="text-xs text-muted-foreground">
                Tip: Keep messages short and plaintext. Markdown like **bold** is allowed - it will
                be rendered in the embed description. Press <code
                className="px-1 py-0.5 bg-surface-muted rounded">Ctrl+Enter</code> to add/update
                quickly.
            </p>

            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel}
                    handleSave={handleSave}
                    isSaving={isPending}
                />
            )}
        </div>
    );
}
