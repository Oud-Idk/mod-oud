"use client";

import { useEffect, useState, useTransition } from "react";
import { getTicketHistoryAction, getTicketsListAction } from "@/actions/tickets";
import { TicketHistory } from "@/utils/db/ticketHistory";
import { Dropdown } from "@/components/Inputs/Dropdown";

import { Ticket, ViewTicketStatus } from "@/types/db";

interface HistoryTabProps {
    guildId: string;
}

export default function HistoryTab({ guildId }: HistoryTabProps) {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [filteredTickets, setFilteredTickets] = useState<Ticket[]>([]);
    const [selectedTicket, setSelectedTicket] = useState<TicketHistory | null>(null);
    const [statusFilter, setStatusFilter] = useState<ViewTicketStatus>("ALL");
    const [isPending, startTransition] = useTransition();
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    useEffect(() => {
        startTransition(async () => {
            try {
                const list = await getTicketsListAction(guildId);
                setTickets(list);
                setFilteredTickets(list);
            } catch (err) {
                console.error(err);
            }
        });
    }, [guildId]);

    useEffect(() => {
        let result = tickets;

        if (statusFilter !== "ALL") {
            result = result.filter((t) => t.status === statusFilter);
        }

        setFilteredTickets(result);
    }, [statusFilter, tickets]);

    const handleViewHistory = async (channelId: string) => {
        setIsLoadingHistory(true);
        try {
            const history = await getTicketHistoryAction(channelId);
            setSelectedTicket(history);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoadingHistory(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center border p-3 rounded-lg">
                <div className="flex items-center gap-2 w-full">
                    <span className="text-sm">Status:</span>
                    <Dropdown
                        value={statusFilter} onChange={(v) => setStatusFilter(v as ViewTicketStatus)} options={[
                        {
                            value: "ALL",
                            label: "All",
                        },
                        {
                            value: "OPEN",
                            label: "Open",
                        },
                        {
                            value: "CLOSED",
                            label: "Closed",
                        }
                    ]} className="max-w-40"
                    />
                </div>
            </div>

            <div className="">
                <div className={`lg:col-span-7 border mb-4 rounded-lg p-4 overflow-x-auto ${selectedTicket ? 'hidden lg:block' : 'col-span-12'}`}>
                    <h2 className="text-lg font-semibold mb-4">Ticket Entries</h2>
                    {isPending ? (
                        <div className="py-8 text-center">Loading ticket list...</div>
                    ) : filteredTickets.length === 0 ? (
                        <div className="py-8 text-center">No ticket histories found.</div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead>
                            <tr className="border-b text-sm">
                                <th className="py-2">ID</th>
                                <th className="py-2">Opener</th>
                                <th className="py-2">Status</th>
                                <th className="py-2">Messages</th>
                                <th className="py-2">Created At</th>
                                <th className="py-2 text-right">Action</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-500  text-sm">
                            {filteredTickets.map((ticket) => (
                                <tr key={ticket.id} className="hover:bg-neutral-300/10">
                                    <td className="py-3">#{ticket.id}</td>
                                    <td className="py-3 font-mono text-xs">{ticket.opener_id}</td>
                                    <td className="py-3">
                                        <span
                                            className={`py-0.5 rounded text-xs font-semibold ${
                                                ticket.status === 'OPEN' ? 'text-green-400' : 'text-red-400'
                                            }`}
                                        >
                                            {ticket.status}
                                        </span>
                                    </td>
                                    <td className="py-3">{ticket.message_count}</td>
                                    <td className="py-3">{new Date(ticket.created_at).toLocaleString()}</td>
                                    <td className="py-3 text-right">
                                        <button
                                            onClick={() => handleViewHistory(ticket.channel_id)}
                                            className="text-sm px-3 py-1 rounded border-neutral-500 hover:bg-neutral-300/10 border cursor-pointer mr-2"
                                            disabled={isLoadingHistory}
                                        >
                                            View
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Ticket Transcript Detail Column */}
                {selectedTicket && (
                    <div className="lg:col-span-5 rounded-lg p-4 flex flex-col h-150 border">
                        <div className="flex justify-between items-center border-b pb-3 mb-4">
                            <div>
                                <h3 className="text-md font-semibold">Ticket
                                    #{selectedTicket.ticket_id} History</h3>
                                <p className="text-xs">Opener: {selectedTicket.opener_name}</p>
                            </div>
                            <button
                                onClick={() => setSelectedTicket(null)}
                                className="text-sm px-3 py-1 rounded border-neutral-500 hover:bg-neutral-300/10 border cursor-pointer"
                            >
                                Close View
                            </button>
                        </div>

                        {/* Message Transcript Log */}
                        <div className="flex-1 overflow-y-auto space-y-4 pr-2 p-3 rounded border border-neutral-500 shadow">
                            {selectedTicket.messages.length === 0 ? (
                                <div className="text-zinc-500 text-center py-12 text-sm">No messages recorded in this
                                    ticket.</div>
                            ) : (
                                selectedTicket.messages.map((msg, index) => (
                                    <div key={msg.message_id || index} className="text-sm shadow">
                                        <div className="flex items-baseline justify-between mb-1">
                                            <p className={`text-xs ${msg.is_ticket_manager ? "text-indigo-500" : ""}`}>User: {msg.sender_name}</p>
                                            <span className="text-[10px] text-zinc-500">
                                                {new Date(msg.created_at).toLocaleString()}
                                            </span>
                                        </div>
                                        <p className="border-neutral-500 border whitespace-pre-wrap break-all p-2 rounded">
                                            {msg.content}
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}