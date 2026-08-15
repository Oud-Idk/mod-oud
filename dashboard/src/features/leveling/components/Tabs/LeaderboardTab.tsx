"use client";

import { JSX, useCallback, useEffect, useRef, useState } from "react";
import { UserLevel } from "@/features/leveling/types";
import Footer from "@/components/layout/Footer";
import { toast } from "sonner";
import { RotateCw } from "lucide-react";

interface LeaderboardTabProps {
    levels?: UserLevel[];
    fetchMoreLevels: (currentLowestXp: number) => Promise<UserLevel[]>;
}

export function LeaderboardTab({
    levels = [],
    fetchMoreLevels,
}: LeaderboardTabProps): JSX.Element {
    const [displayedLevels, setDisplayedLevels] = useState<UserLevel[]>(levels);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [hasMore, setHasMore] = useState<boolean>(true);
    const [hasError, setHasError] = useState<boolean>(false);

    const observer = useRef<IntersectionObserver | null>(null);

    useEffect(() => {
        setDisplayedLevels(levels);
        setHasMore(levels.length > 0);
        setHasError(false);
    }, [levels]);

    const loadMoreItems = useCallback(async (): Promise<void> => {
        if (isLoading || !hasMore || hasError || displayedLevels.length === 0) return;

        setIsLoading(true);
        setHasError(false);

        try {
            const lastItem = displayedLevels[displayedLevels.length - 1];
            const lowestXp = lastItem.cumulative_xp;
            const newLevels = await fetchMoreLevels(lowestXp);

            if (newLevels.length === 0) {
                setHasMore(false);
            } else {
                setDisplayedLevels((prev) => [...prev, ...newLevels]);

                if (newLevels.length < 20) {
                    setHasMore(false);
                }
            }
        } catch (error) {
            console.error("Error loading more leaderboard levels:", error);
            setHasError(true);
            toast.error("Failed to load more leaderboard rankings.");
        } finally {
            setIsLoading(false);
        }
    }, [isLoading, hasMore, hasError, displayedLevels, fetchMoreLevels]);

    const handleRetry = (): void => {
        setHasError(false);
        void loadMoreItems();
    };

    const lastElementRef = useCallback(
        (node: HTMLDivElement | null): void => {
            if (isLoading) return;

            if (observer.current !== null) {
                observer.current.disconnect();
            }

            observer.current = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting && hasMore && !hasError) {
                    void loadMoreItems();
                }
            });

            if (node !== null) {
                observer.current.observe(node);
            }
        },
        [isLoading, hasMore, hasError, loadMoreItems]
    );

    useEffect(() => {
        return () => {
            if (observer.current !== null) {
                observer.current.disconnect();
            }
        };
    }, []);

    return (
        <div className="w-full mx-auto mt-4">
            <div className="space-y-2.5">
                {displayedLevels.map((userLevel, index) => {
                    const rank = index + 1;

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

                    const displayName =
                        userLevel.username.length > 0
                            ? userLevel.username
                            : `User ${userLevel.user_id}`;

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
                                        {displayName}
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

                {hasError && !isLoading && (
                    <button
                        type="button"
                        onClick={handleRetry}
                        className="flex items-center gap-1.5 text-xs text-danger hover:underline font-medium cursor-pointer p-2"
                    >
                        <RotateCw className="w-3.5 h-3.5" /> Failed to load. Click to retry.
                    </button>
                )}

                {!hasMore && !hasError && displayedLevels.length > 0 && (
                    <Footer>
                        End of Leaderboard
                    </Footer>
                )}
            </div>
        </div>
    );
}