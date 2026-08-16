"use client";

import React from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useMarkdownScroller } from "@/components/ui/markdown/useMarkdownScroller";
import { cn } from "@/lib/cn";

interface ScrollableMarkdownViewerProps {
    content?: string;
    className?: string;
    markdownClassName?: string;
}

export const ScrollableMarkdownViewer: React.FC<ScrollableMarkdownViewerProps> = ({
    content,
    className,
    markdownClassName
}) => {
    const { containerRef, handleLinkClick } = useMarkdownScroller();

    return (
        <div
            ref={containerRef}
            onClick={handleLinkClick}
            className={cn("overflow-auto", className)}
        >
            <MarkdownRenderer content={content} className={markdownClassName} />
        </div>
    );
};