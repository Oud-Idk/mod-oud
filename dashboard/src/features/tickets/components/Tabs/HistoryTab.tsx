"use client";

import { JSX, useEffect, useState, useTransition } from "react";
import { getTicketHistoryAction, getTicketsListAction } from "@/features/tickets/actions";
import { Dropdown } from "@/components/ui/Dropdown";
import { Ticket, TicketHistory, ViewTicketStatus } from "@/features/tickets/types";
import { cn } from "@/lib/cn";

interface HistoryTabProps {
    guildId: string;
}

export default function HistoryTab({ guildId }: HistoryTabProps): JSX.Element {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [filteredTickets, setFilteredTickets] = useState<Ticket[]>([]);
    const [selectedTicket, setSelectedTicket] = useState<TicketHistory | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [loadingChannelId, setLoadingChannelId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<ViewTicketStatus>("ALL");
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        startTransition(async () => {
            try {
                const list = await getTicketsListAction(guildId);
                // 🛡️ Safety Guard: Ensure list is an array!
                const safeList = Array.isArray(list) ? list : [];
                setTickets(safeList);
            } catch (err) {
                console.error("Failed to load ticket list:", err);
                setTickets([]);
            }
        });
    }, [guildId]);

    useEffect(() => {
        // 🛡️ Safety Guard: Ensure tickets is an array before filtering!
        let result = Array.isArray(tickets) ? tickets : [];

        if (statusFilter !== "ALL") {
            result = result.filter((t) => t.status === statusFilter);
        }
        setFilteredTickets(result);
    }, [statusFilter, tickets]);

    const handleViewHistory = async (channelId: string): Promise<void> => {
        setLoadingChannelId(channelId);
        setDrawerOpen(true);
        try {
            const history = await getTicketHistoryAction(guildId, channelId);
            setSelectedTicket(history);
        } catch (err) {
            console.error("Failed to fetch ticket history:", err);
        } finally {
            setLoadingChannelId(null);
        }
    };

    const closeDrawer = (): void => {
        setDrawerOpen(false);
        setTimeout(() => setSelectedTicket(null), 200);
    };

    // 🛡️ Extra fallback safety
    const safeFilteredTickets = Array.isArray(filteredTickets) ? filteredTickets : [];

    return (
        <div className="space-y-2 relative">
            {/* Toolbar Filter */}
            <div className="bg-surface border border-border rounded-xl py-2 px-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <span className="text-sm font-medium text-muted-foreground">Status Filter:</span>
                    <Dropdown
                        value={statusFilter}
                        onChange={(v) => setStatusFilter(v || "ALL")}
                        options={[
                            { value: "ALL", label: "All Tickets" },
                            { value: "OPEN", label: "Open" },
                            { value: "CLOSED", label: "Closed" }
                        ]}
                        className="w-44"
                    />
                </div>
                <div className="text-xs text-muted-foreground">
                    Showing <span className="font-semibold text-foreground">{safeFilteredTickets.length}</span> entries
                </div>
            </div>

            {/* Tickets Table */}
            <div className="bg-surface border border-border rounded-xl shadow-xs overflow-hidden">
                <div className="px-4 py-2 border-b border-border-subtle flex items-center justify-between">
                    <h2 className="text-base font-semibold text-foreground">Ticket Entries</h2>
                </div>

                {isPending ? (
                    <div className="py-16 text-center text-sm text-muted-foreground">
                        Loading ticket list...
                    </div>
                ) : safeFilteredTickets.length === 0 ? (
                    <div className="py-16 text-center text-sm text-muted-foreground">
                        No ticket histories found.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                            <tr className="border-b border-border-subtle bg-surface-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                <th scope="col" className="py-3 px-4">Ticket</th>
                                <th scope="col" className="py-3 px-4">Opener ID</th>
                                <th scope="col" className="py-3 px-4">Status</th>
                                <th scope="col" className="py-3 px-4">Msgs</th>
                                <th scope="col" className="py-3 px-4">Created At</th>
                                <th scope="col" className="py-3 px-4 text-right">Action</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle text-sm">
                            {safeFilteredTickets.map((ticket) => {
                                const isSelected = selectedTicket?.ticket_id === ticket.id && drawerOpen;
                                const isLoadingThis = loadingChannelId === ticket.channel_id;
                                const isOpen = ticket.status === "OPEN";

                                return (
                                    <tr
                                        key={ticket.id}
                                        className={cn(
                                            "transition-colors hover:bg-surface-muted/60",
                                            isSelected && "bg-surface-active/70"
                                        )}
                                    >
                                        <td className="py-3.5 px-4 font-mono font-medium text-foreground">
                                            #{ticket.id}
                                        </td>
                                        <td className="py-3.5 px-4 font-mono text-xs text-muted-foreground">
                                            {ticket.opener_id}
                                        </td>
                                        <td className="py-3.5 px-4">
                                            <span
                                                className={cn(
                                                    "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border",
                                                    isOpen
                                                        ? "bg-success-subtle text-success border-success/20"
                                                        : "bg-surface-muted text-muted-foreground border-border"
                                                )}
                                            >
                                                <span
                                                    className={cn(
                                                        "w-1.5 h-1.5 rounded-full",
                                                        isOpen ? "bg-success" : "bg-muted-foreground"
                                                    )}
                                                />
                                                {ticket.status}
                                            </span>
                                        </td>
                                        <td className="py-3.5 px-4 text-muted-foreground">
                                            {ticket.message_count}
                                        </td>
                                        <td className="py-3.5 px-4 text-xs text-muted-foreground whitespace-nowrap">
                                            {new Date(ticket.created_at).toLocaleString()}
                                        </td>
                                        <td className="py-3.5 px-4 text-right">
                                            <button
                                                onClick={() => handleViewHistory(ticket.channel_id)}
                                                disabled={isLoadingThis}
                                                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-surface hover:bg-surface-muted text-foreground focus-ring cursor-pointer transition-colors disabled:opacity-50 shadow-xs"
                                            >
                                                {isLoadingThis ? "Loading..." : "View"}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Backdrop */}
            <div
                onClick={closeDrawer}
                aria-hidden="true"
                className={cn(
                    "fixed inset-0 bg-black/40 z-40 transition-opacity duration-200",
                    drawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                )}
            />

            {/* Slide-over Drawer */}
            <div
                role="dialog"
                aria-modal="true"
                aria-label={selectedTicket ? `Ticket #${selectedTicket.ticket_id} transcript` : "Ticket transcript"}
                className={cn(
                    "fixed top-0 right-0 h-full w-full sm:w-120 bg-surface border-l border-border shadow-xl z-50",
                    "flex flex-col transition-transform duration-200 ease-out",
                    drawerOpen ? "translate-x-0" : "translate-x-full"
                )}
            >
                {selectedTicket ? (
                    <>
                        <div className="flex justify-between items-start border-b border-border-subtle p-5">
                            <div>
                                <h3 className="text-base font-semibold text-foreground">
                                    Ticket #{selectedTicket.ticket_id}
                                </h3>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Opener: <span className="font-mono text-foreground">{selectedTicket.opener_id}</span>
                                </p>
                            </div>
                            <button
                                onClick={closeDrawer}
                                className="px-2.5 py-1 text-xs font-medium rounded-lg border border-border bg-surface hover:bg-surface-muted text-muted-foreground hover:text-foreground focus-ring cursor-pointer transition-colors"
                            >
                                Close
                            </button>
                        </div>

                        {/* Message Transcript Log */}
                        <div className="flex-1 overflow-y-auto space-y-3 p-4 bg-surface-muted/30">
                            {(selectedTicket.messages ?? []).length === 0 ? (
                                <div className="text-muted-foreground text-center py-16 text-sm">
                                    No messages recorded in this ticket.
                                </div>
                            ) : (
                                selectedTicket.messages.map((msg, index) => {
                                    const isManager = msg.is_ticket_manager;

                                    return (
                                        <div
                                            key={msg.message_id || index}
                                            className={cn(
                                                "p-3 rounded-lg border text-sm transition-colors",
                                                isManager
                                                    ? "bg-brand-subtle/40 border-brand/20"
                                                    : "bg-surface border-border-subtle shadow-2xs"
                                            )}
                                        >
                                            <div className="flex items-center justify-between mb-1.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-semibold text-foreground">
                                                        {msg.author_id}
                                                    </span>
                                                    {isManager && (
                                                        <span className="bg-brand text-brand-foreground text-[10px] font-medium px-1.5 py-0.2 rounded">
                                                            Staff
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-[10px] text-muted-foreground">
                                                    {new Date(msg.created_at).toLocaleString()}
                                                </span>
                                            </div>
                                            <p className="text-xs text-foreground/90 whitespace-pre-wrap wrap-break-word leading-relaxed">
                                                {msg.content}
                                            </p>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                        Loading transcript...
                    </div>
                )}
            </div>
        </div>
    );
}