"use client";

import React from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useMarkdownScroller } from "../../../../../../../Websites/homework-app/frontend/src/hooks/useMarkdownScroller";

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
            className={`overflow-auto ${className || ''}`}
        >
            <MarkdownRenderer content={content} className={markdownClassName} />
        </div>
    );
};