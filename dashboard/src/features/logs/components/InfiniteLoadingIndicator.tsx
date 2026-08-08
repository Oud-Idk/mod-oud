import React, { forwardRef } from "react";

interface InfiniteLoadingIndicatorProps {
    loadingMore: boolean;
    hasMore: boolean;
    logsLength: number;
}

export const InfiniteLoadingIndicator = forwardRef<
    HTMLDivElement,
    InfiniteLoadingIndicatorProps
>(({ loadingMore, hasMore, logsLength }, ref) => {
    return (
        <div ref={ref} className="py-6 flex justify-center items-center min-h-10">
            {loadingMore && (
                <span className="text-sm text-muted-foreground animate-pulse">Loading older entries...</span>
            )}
            {!hasMore && logsLength > 0 && (
                <span className="text-xs text-muted-foreground/60">All entries loaded</span>
            )}
        </div>
    );
});

InfiniteLoadingIndicator.displayName = "InfiniteLoadingIndicator";