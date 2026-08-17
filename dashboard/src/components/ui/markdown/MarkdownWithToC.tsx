"use client";

import React, { useRef } from "react";
import { TableOfContents } from "./TableOfContents";
import { MarkdownRenderer } from "@/components/ui/markdown/MarkdownRenderer";

interface MarkdownWithTocProps {
    content?: string;
    className?: string;
    showToc?: boolean;
}

export const MarkdownWithToc: React.FC<MarkdownWithTocProps> = ({
    content,
    className = "",
    showToc = true,
}) => {
    const contentRef = useRef<HTMLDivElement>(null);

    return (
        <div className="relative flex w-full justify-center gap-8">
            {/* Main Markdown Content Area */}
            <div ref={contentRef} className="min-w-0 max-w-4xl flex-1">
                <MarkdownRenderer content={content} className={className} />
            </div>

            {/* Sticky Side Table of Contents (Desktop only) */}
            {showToc && (
                <aside className="hidden xl:block max-w-80 shrink-0">
                    <div className="sticky top-20 max-h-[calc(100vh-30rem)] overflow-y-auto pr-2 scrollbar-thin">
                        <TableOfContents containerRef={contentRef} content={content} />
                    </div>
                </aside>
            )}
        </div>
    );
};