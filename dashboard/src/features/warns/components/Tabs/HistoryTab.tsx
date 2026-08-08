"use client";

import React, { ChangeEvent, ReactNode, useState } from "react";
import { Pad } from "@/components/layout/Pad";
import Footer from "@/components/layout/Footer";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/layout/Table";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TextInput } from "@/components/ui/TextInput";
import { searchWarnsAction } from "../../actions";
import type { Warn } from "../../types";

interface HistoryTabProps {
    guildId: string;
}

export function HistoryTab({ guildId }: HistoryTabProps): ReactNode {
    const [userId, setUserId] = useState("");
    const [warns, setWarns] = useState<Warn[]>([]);
    const [searchedUserId, setSearchedUserId] = useState<string | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [reasonModalOpen, setReasonModalOpen] = useState(false);
    const [currentReason, setCurrentReason] = useState<string | null>(null);

    const onSearch = (): void => {
        if (!userId.trim()) return;
        setIsSearching(true);
        searchWarnsAction(guildId, userId.trim())
            .then((result) => {
                setWarns(result);
                setSearchedUserId(userId.trim());
            })
            .catch((err) => {
                console.error("Error searching warns:", err);
            })
            .finally(() => {
                setIsSearching(false);
            });
    };

    const handleInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
        const alphanumericValue = e.target.value.replace(/[^0-9]/g, "");
        setUserId(alphanumericValue);
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-row gap-2 max-w-md">
                <TextInput
                    value={userId}
                    onChange={handleInputChange}
                    placeholder="Type User Discord ID..."
                    className="font-mono"
                />
                <Button onClick={onSearch} disabled={isSearching || !userId.trim()}>
                    {isSearching ? "Searching..." : "Search"}
                </Button>
            </div>

            {warns.length > 0 && (
                <Table>
                    <TableHeader headers={["Warn ID", "Warned By", "Target User", "Reason", "Timestamp"]} />
                    <TableBody>
                        {warns.map((warn) => (
                            <TableRow key={warn.id}>
                                <TableCell className="font-mono">{warn.id}</TableCell>
                                <TableCell>{warn.moderator_id}</TableCell>
                                <TableCell>{warn.user_id}</TableCell>
                                <TableCell>
                                    {warn.reason.length < 50 ? (
                                        warn.reason
                                    ) : (
                                        <button
                                            type="button"
                                            className="text-brand hover:underline cursor-pointer text-left"
                                            onClick={() => {
                                                setCurrentReason(warn.reason);
                                                setReasonModalOpen(true);
                                            }}
                                        >
                                            {warn.reason.slice(0, 49)}...
                                        </button>
                                    )}
                                </TableCell>
                                <TableCell>{new Date(warn.created_at).toLocaleString()}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}

            {reasonModalOpen && currentReason && (
                <Modal
                    headerText="Full Warn Reason"
                    onClose={() => {
                        setReasonModalOpen(false);
                        setCurrentReason(null);
                    }}
                >
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed py-2">
                        {currentReason}
                    </p>
                </Modal>
            )}

            {searchedUserId && warns.length === 0 && (
                <Footer>No warning history found for User ID: {searchedUserId}</Footer>
            )}
        </div>
    );
}