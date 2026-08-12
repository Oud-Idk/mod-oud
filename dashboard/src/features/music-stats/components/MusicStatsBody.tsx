"use client";

import { JSX } from "react";
import { ExternalLink } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHeader,
    TableRow,
} from "@/components/layout/Table";
import { ListenerStat, MusicStatsSummary, TrackStat } from "@/features/music-stats/types";

interface MusicStatsBodyProps {
    summary: MusicStatsSummary;
    topTracks: TrackStat[];
    topListeners: ListenerStat[];
}

function formatDuration(totalMs: number): string {
    const totalSeconds = Math.floor(totalMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0) {
        return String(hours) + "h " + String(minutes) + "m";
    }
    return String(minutes) + "m";
}

function RankBadge({ rank }: { rank: number }): JSX.Element {
    if (rank === 1) {
        return (
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-warning-subtle text-warning text-xs font-bold border border-warning/30">
                1
            </span>
        );
    }
    if (rank === 2) {
        return (
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-surface-active text-foreground text-xs font-bold border border-border">
                2
            </span>
        );
    }
    if (rank === 3) {
        return (
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-accent-subtle text-accent text-xs font-bold border border-accent/30">
                3
            </span>
        );
    }
    return (
        <span className="text-muted-foreground text-xs font-medium pl-1.5">
            #{rank}
        </span>
    );
}

function SummaryCard({ label, value }: { label: string; value: string }): JSX.Element {
    return (
        <div className="bg-surface border border-border rounded-xl px-5 py-4 shadow-sm">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
        </div>
    );
}

function EmptyState({ message }: { message: string }): JSX.Element {
    return (
        <div className="py-12 text-center border border-dashed border-border-subtle rounded-xl bg-surface">
            <p className="text-sm text-muted-foreground">{message}</p>
        </div>
    );
}

export function MusicStatsBody({
    summary,
    topTracks,
    topListeners,
}: MusicStatsBodyProps): JSX.Element {
    return (
        <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <SummaryCard label="Total Plays" value={summary.totalPlays.toLocaleString()} />
                <SummaryCard label="Listening Time" value={formatDuration(summary.totalListenedMs)} />
                <SummaryCard label="Unique Tracks" value={summary.uniqueTracks.toLocaleString()} />
                <SummaryCard label="Unique Listeners" value={summary.uniqueListeners.toLocaleString()} />
            </div>

            <section className="flex flex-col gap-2">
                <h4 className="text-lg font-medium">Top Tracks</h4>
                {topTracks.length === 0 ? (
                    <EmptyState message="No music plays recorded in the last 30 days." />
                ) : (
                    <Table className="border border-border bg-surface rounded-lg overflow-hidden">
                        <TableHeader headers={["Rank", "Track", "Plays", "Listening Time"]} />
                        <TableBody>
                            {topTracks.map((track, index) => (
                                <TableRow key={track.title + track.artist + (track.trackUrl ?? "") + String(index)}>
                                    <TableCell className="font-medium">
                                        <RankBadge rank={index + 1} />
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-medium text-foreground">
                                                {track.title}
                                            </span>
                                            {track.trackUrl != null && (
                                                <a
                                                    href={track.trackUrl}
                                                    target="_blank"
                                                    rel="noreferrer noopener"
                                                    className="text-muted-foreground hover:text-brand transition-colors"
                                                    aria-label={`Open source URL for ${track.title}`}
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                </a>
                                            )}
                                        </div>
                                        <span className="block text-xs text-muted-foreground">
                                            {track.artist}
                                        </span>
                                    </TableCell>
                                    <TableCell className="font-semibold text-foreground">
                                        {track.plays.toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {formatDuration(track.totalListenedMs)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </section>

            <section className="flex flex-col gap-2">
                <h4 className="text-lg font-medium">Top Listeners</h4>
                {topListeners.length === 0 ? (
                    <EmptyState message="No music plays recorded in the last 30 days." />
                ) : (
                    <Table className="border border-border bg-surface rounded-lg overflow-hidden">
                        <TableHeader headers={["Rank", "User ID", "Plays", "Listening Time"]} />
                        <TableBody>
                            {topListeners.map((listener, index) => (
                                <TableRow key={listener.userId}>
                                    <TableCell className="font-medium">
                                        <RankBadge rank={index + 1} />
                                    </TableCell>
                                    <TableCell className="font-mono text-xs text-foreground">
                                        <a
                                            href={`https://discord.com/users/${listener.userId}`}
                                            target="_blank"
                                            rel="noreferrer noopener"
                                            className="hover:text-brand transition-colors"
                                        >
                                            {listener.userId}
                                        </a>
                                    </TableCell>
                                    <TableCell className="font-semibold text-foreground">
                                        {listener.plays.toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {formatDuration(listener.totalListenedMs)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </section>
        </div>
    );
}
