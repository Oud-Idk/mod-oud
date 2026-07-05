import { useCallback, useEffect, useRef, useState } from "react";
import { UserLevel } from "@/utils/db/leaderboard";

interface leaderboardTabProps {
    levels?: UserLevel[];
    fetchMoreLevels: (currentLowestXp: number) => Promise<UserLevel[]>;
}

export function LeaderboardTab({
    levels = [],
    fetchMoreLevels,
}: leaderboardTabProps) {
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
            // Safely fetch the last item's XP
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
        // Removed the unsafe property lookup from the dependency array below:
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
            <div className="space-y-2">
                {displayedLevels.map((userLevel, index) => (
                    <div
                        key={`${userLevel.guild_id}-${userLevel.user_id}`}
                        className="flex justify-between items-center p-2 px-4 border rounded-lg bg-card text-card-foreground shadow-sm hover:bg-accent/50 transition-colors"
                    >
                        <div className="flex items-center space-x-4">
                            <span className="font-semibold text-muted-foreground w-8">
                                #{index + 1}
                            </span>
                            <div>
                                <div className="font-medium">
                                    {userLevel.username || `User ${userLevel.user_id}`}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    Level {userLevel.current_level}
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="font-mono text-sm font-semibold">
                                {userLevel.cumulative_xp.toLocaleString()} XP
                            </div>
                            <div className="text-xs text-muted-foreground">
                                {userLevel.current_xp.toLocaleString()} current level XP
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Sentinel element to trigger fetching */}
            <div ref={lastElementRef} className="h-12 w-full flex items-center justify-center mt-4">
                {isLoading && (
                    <span className="text-sm text-muted-foreground animate-pulse">
                        Loading more users...
                    </span>
                )}
                {!hasMore && displayedLevels.length > 0 && (
                    <span className="text-sm text-muted-foreground">
                        End of leaderboard
                    </span>
                )}
            </div>
        </div>
    );
}