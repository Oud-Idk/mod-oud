"use client";

import React, { useRef, useCallback, RefObject } from 'react';

interface UseMarkdownScrollerReturn {
    containerRef: RefObject<HTMLDivElement | null>;
    handleLinkClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}


export const useMarkdownScroller = (): UseMarkdownScrollerReturn => {
    const containerRef = useRef<HTMLDivElement>(null);

    const handleLinkClick = useCallback((event: React.MouseEvent<HTMLDivElement>): void => {
        if (!(event.target instanceof Element)) {
            return;
        }

        const link = event.target.closest("a");

        if (
            link !== null &&
            link.hash.length > 0 &&
            link.pathname === window.location.pathname
        ) {
            event.preventDefault();
            event.stopPropagation();

            const id = decodeURIComponent(link.hash.substring(1));
            const container = containerRef.current;

            // Using CSS.escape prevents errors if your heading ID starts with a number or special char
            const element = container?.querySelector(`#${CSS.escape(id)}`);

            if (element !== null && element !== undefined && container !== null) {
                const targetTop = element.getBoundingClientRect().top;
                const containerTop = container.getBoundingClientRect().top;
                const scrollPosition = targetTop - containerTop + container.scrollTop;

                container.scrollTo({
                    top: scrollPosition,
                    behavior: "smooth",
                });
            }
        }
    }, []);

    return { containerRef, handleLinkClick };
};