"use client";

import { JSX, useCallback, useEffect, useRef, useState } from "react";
import { UserLevel } from "@/features/leveling/types";
import Footer from "@/components/layout/Footer";

interface LeaderboardTabProps {
    levels?: UserLevel[];
    fetchMoreLevels: (currentLowestXp: number) => Promise<UserLevel[]>;
}

export function LeaderboardTab({
    levels = [],
    fetchMoreLevels,
}: LeaderboardTabProps): JSX.Element {
    const [displayedLevels, setDisplayedLevels] = useState<UserLevel[]>(levels);
    const [isLoading, setIsLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    const observer = useRef<IntersectionObserver | null>(null);

    useEffect(() => {
        setDisplayedLevels(levels);
        setHasMore(levels.length > 0);
    }, [levels]);

    const loadMoreItems = useCallback(async () => {
        if (isLoading || !hasMore || displayedLevels.length === 0) return;

        setIsLoading(true);
        try {
            const lastItem = displayedLevels[displayedLevels.length - 1];
            if (!lastItem) return;

            const lowestXp = lastItem.cumulative_xp;
            const newLevels = await fetchMoreLevels(lowestXp);

            if (newLevels.length === 0) {
                setHasMore(false);
            } else {
                setDisplayedLevels((prev) => [...prev, ...newLevels]);

                // Assuming a default limit of 20, we stop querying if fewer are returned
                if (newLevels.length < 20) {
                    setHasMore(false);
                }
            }
        } catch (error) {
            console.error("Error loading more leaderboard levels:", error);
        } finally {
            setIsLoading(false);
        }
    }, [isLoading, hasMore, displayedLevels, fetchMoreLevels]);

    const lastElementRef = useCallback(
        (node: HTMLDivElement | null) => {
            if (isLoading) return;

            if (observer.current) {
                observer.current.disconnect();
            }

            observer.current = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting && hasMore) {
                    loadMoreItems();
                }
            });

            if (node) {
                observer.current.observe(node);
            }
        },
        [isLoading, hasMore, loadMoreItems]
    );

    useEffect(() => {
        return () => {
            if (observer.current) {
                observer.current.disconnect();
            }
        };
    }, []);

    return (
        <div className="w-full mx-auto mt-4">
            <div className="space-y-2.5">
                {displayedLevels.map((userLevel, index) => {
                    const rank = index + 1;

                    // Compute dynamic themes for top-tier ranks (Gold, Silver, Bronze)
                    let rowStyle = "bg-surface border-border hover:bg-surface-active/60";
                    let rankBadgeStyle = "text-muted-foreground";

                    if (rank === 1) {
                        rowStyle = "bg-warning-subtle/50 border-warning/30 hover:bg-warning-subtle/70 shadow-sm";
                        rankBadgeStyle = "text-warning font-extrabold scale-110";
                    } else if (rank === 2) {
                        rowStyle = "bg-info-subtle/50 border-info/30 hover:bg-info-subtle/70";
                        rankBadgeStyle = "text-info font-extrabold";
                    } else if (rank === 3) {
                        rowStyle = "bg-brand-subtle/50 border-brand/30 hover:bg-brand-subtle/70";
                        rankBadgeStyle = "text-brand font-extrabold";
                    }

                    return (
                        <div
                            key={`${userLevel.guild_id}-${userLevel.user_id}`}
                            className={`flex justify-between items-center py-1 px-2 border rounded-lg text-foreground transition-all duration-150 ${rowStyle}`}
                        >
                            <div className="flex items-center space-x-4">
                                <span className={`font-mono text-sm w-8 text-center select-none ${rankBadgeStyle}`}>
                                    #{rank}
                                </span>
                                <div>
                                    <p className="font-bold text-sm text-foreground">
                                        {userLevel.username || `User ${userLevel.user_id}`}
                                    </p>
                                    <Footer>
                                        Level {userLevel.current_level}
                                    </Footer>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="font-mono text-sm font-extrabold text-foreground">
                                    {userLevel.cumulative_xp.toLocaleString()} XP
                                </p>
                                <Footer>{userLevel.current_xp.toLocaleString()} current level XP</Footer>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Sentinel element to trigger fetching */}
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
                {!hasMore && displayedLevels.length > 0 && (
                    <Footer>
                        End of Leaderboard
                    </Footer>
                )}
            </div>
        </div>
    );
}