"use client";

import { JSX, useCallback, useEffect, useRef, useState } from "react";
import { EconomyLeaderboardEntry } from "@/features/economy/types";
import Footer from "@/components/layout/Footer";
import { toast } from "sonner";
import { RotateCw } from "lucide-react";

interface EconomyLeaderboardTabProps {
    entries?: EconomyLeaderboardEntry[];
    currencyName: string;
    fetchMore: (currentLowestTotal: number) => Promise<EconomyLeaderboardEntry[]>;
}

export function EconomyLeaderboardTab({
    entries = [],
    currencyName,
    fetchMore,
}: EconomyLeaderboardTabProps): JSX.Element {
    const [displayed, setDisplayed] = useState<EconomyLeaderboardEntry[]>(entries);
    const [isLoading, setIsLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [hasError, setHasError] = useState(false);

    const observer = useRef<IntersectionObserver | null>(null);

    useEffect(() => {
        setDisplayed(entries);
        setHasMore(entries.length > 0);
        setHasError(false);
    }, [entries]);

    const loadMore = useCallback(async (): Promise<void> => {
        if (isLoading || !hasMore || hasError || displayed.length === 0) return;
        setIsLoading(true);
        setHasError(false);
        try {
            const last = displayed[displayed.length - 1];
            const lowestTotal = last.total;
            const more = await fetchMore(lowestTotal);
            if (more.length === 0) {
                setHasMore(false);
            } else {
                setDisplayed((prev) => [...prev, ...more]);
                if (more.length < 20) setHasMore(false);
            }
        } catch (error) {
            console.error("Error loading more economy leaderboard:", error);
            setHasError(true);
            toast.error("Failed to load more leaderboard entries.");
        } finally {
            setIsLoading(false);
        }
    }, [isLoading, hasMore, hasError, displayed, fetchMore]);

    const handleRetry = (): void => {
        setHasError(false);
        void loadMore();
    };

    const lastElementRef = useCallback(
        (node: HTMLDivElement | null): void => {
            if (isLoading) return;
            if (observer.current !== null) observer.current.disconnect();
            observer.current = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting && hasMore && !hasError) {
                    void loadMore();
                }
            });
            if (node !== null) observer.current.observe(node);
        },
        [isLoading, hasMore, hasError, loadMore]
    );

    useEffect(() => {
        return () => {
            if (observer.current !== null) observer.current.disconnect();
        };
    }, []);

    return (
        <div className="w-full mx-auto mt-4">
            {displayed.length === 0 ? (
                <div className="p-6 border border-dashed border-border-subtle rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">No balances yet.</p>
                    <p className="text-xs text-muted-foreground mt-1">Users will appear here after they earn {currencyName}.</p>
                </div>
            ) : (
                <div className="space-y-2.5">
                    {displayed.map((entry, index) => {
                        const rank = index + 1;
                        let rowStyle = "bg-surface border-border hover:bg-surface-active/60";
                        let rankStyle = "text-muted-foreground";
                        if (rank === 1) {
                            rowStyle = "bg-warning-subtle/50 border-warning/30 hover:bg-warning-subtle/70 shadow-sm";
                            rankStyle = "text-warning font-extrabold scale-110";
                        } else if (rank === 2) {
                            rowStyle = "bg-info-subtle/50 border-info/30 hover:bg-info-subtle/70";
                            rankStyle = "text-info font-extrabold";
                        } else if (rank === 3) {
                            rowStyle = "bg-brand-subtle/50 border-brand/30 hover:bg-brand-subtle/70";
                            rankStyle = "text-brand font-extrabold";
                        }
                        return (
                            <div
                                key={entry.userId}
                                className={`flex justify-between items-center py-2 px-3 border rounded-lg transition-all duration-150 ${rowStyle}`}
                            >
                                <div className="flex items-center space-x-4">
                                    <span className={`font-mono text-sm w-8 text-center select-none ${rankStyle}`}>#{rank}</span>
                                    <div>
                                        <p className="font-bold text-sm text-foreground font-mono">{entry.userId}</p>
                                        <Footer>Wallet {entry.cash.toLocaleString()} · Bank {entry.bank.toLocaleString()}</Footer>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="font-mono text-sm font-extrabold text-foreground">{entry.total.toLocaleString()} {currencyName}</p>
                                    <Footer>total</Footer>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <div ref={lastElementRef} className="h-16 w-full flex items-center justify-center mt-6">
                {isLoading && (
                    <div className="flex items-center gap-2.5 text-sm text-muted-foreground animate-pulse">
                        <svg className="animate-spin h-4 w-4 text-brand" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Loading more users...
                    </div>
                )}
                {hasError && !isLoading && (
                    <button
                        type="button"
                        onClick={handleRetry}
                        className="flex items-center gap-1.5 text-xs text-danger hover:underline font-medium cursor-pointer p-2"
                    >
                        <RotateCw className="w-3.5 h-3.5" /> Failed to load. Click to retry.
                    </button>
                )}
                {!hasMore && !hasError && displayed.length > 0 && <Footer>End of Leaderboard</Footer>}
            </div>
        </div>
    );
}
