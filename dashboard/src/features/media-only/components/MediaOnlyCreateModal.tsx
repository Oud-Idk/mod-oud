"use client";

import React, { JSX, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { InputLabel } from "@/components/layout/InputLabel";
import { getAvailableChannelOptions } from "@/features/_shared/dropdown";
import { toast } from "sonner";

interface MediaOnlyCreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    textChannelMap: Record<string, string>;
    configuredIds: string[];
    onCreate: (channelId: string) => void;
}

export function MediaOnlyCreateModal({
    isOpen,
    onClose,
    textChannelMap,
    configuredIds,
    onCreate,
}: MediaOnlyCreateModalProps): JSX.Element | null {
    const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

    const options = useMemo(
        () =>
            getAvailableChannelOptions(textChannelMap).filter(
                (opt) => !configuredIds.includes(opt.value)
            ),
        [textChannelMap, configuredIds]
    );

    if (!isOpen) return null;

    const handleSubmit = (e: React.SubmitEvent): void => {
        e.preventDefault();
        if (selectedChannelId === null) {
            toast.error("Please select a channel.");
            return;
        }
        onCreate(selectedChannelId);
        setSelectedChannelId(null);
    };

    return (
        <Modal onClose={onClose} headerText="Add Media-Only Channel" className="max-w-md">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <InputLabel required>Channel</InputLabel>
                    <Dropdown
                        options={options}
                        value={selectedChannelId ?? ""}
                        onChange={(val) => { setSelectedChannelId(val); }}
                        placeholder="Choose a channel..."
                    />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit">Add Channel</Button>
                </div>
            </form>
        </Modal>
    );
}
