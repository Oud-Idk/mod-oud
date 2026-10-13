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
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- keyboard link activation already bubbles click
        <div onClick={handleLinkClick}
            ref={containerRef}
            className={cn("overflow-auto", className)}
        >
            <MarkdownRenderer content={content} className={markdownClassName} />
        </div>
    );
};