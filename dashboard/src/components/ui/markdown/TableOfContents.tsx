"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";

export interface TocItem {
    id: string;
    text: string;
    level: number;
}

interface TableOfContentsProps {
    containerRef: React.RefObject<HTMLElement | null>;
    content?: string;
}

function getScrollContainer(element: HTMLElement | null): HTMLElement | Window {
    if (typeof window === "undefined" || !element) return window;
    let parent: HTMLElement | null = element.parentElement;
    while (parent && parent !== document.body && parent !== document.documentElement) {
        const { overflowY } = window.getComputedStyle(parent);
        if (overflowY === "auto" || overflowY === "scroll") {
            return parent;
        }
        parent = parent.parentElement;
    }
    return window;
}

export const TableOfContents: React.FC<TableOfContentsProps> = ({ containerRef, content }) => {
    const [headings, setHeadings] = useState<TocItem[]>([]);
    const [activeId, setActiveId] = useState<string>("");
    const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());
    const navRef = useRef<HTMLElement>(null);
    const [indicator, setIndicator] = useState({ top: 0, height: 0, visible: false });

    const isClickScrollingRef = useRef(false);
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Calculate minimum level so indentation starts from 0 even if page starts at H2
    const minLevel = useMemo(() => {
        if (headings.length === 0) return 1;
        return Math.min(...headings.map((h) => h.level));
    }, [headings]);

    // 1. Scan headings and observe DOM changes
    const scanHeadings = useCallback((): void => {
        if (!containerRef.current) return;

        const elements = containerRef.current.querySelectorAll("h1, h2, h3, h4");
        const items: TocItem[] = [];

        elements.forEach((el): void => {
            if (el.id.trim() !== "" && el.textContent.trim() !== "") {
                const parsedLevel = Number.parseInt(el.tagName.replace("H", ""), 10);
                items.push({
                    id: el.id,
                    text: el.textContent.replace(/^#+\s*/, ""),
                    level: Number.isNaN(parsedLevel) || parsedLevel <= 0 ? 1 : parsedLevel,
                });
            }
        });

        setHeadings(items);
        if (items.length > 0) {
            setActiveId((prev: string): string => (prev !== "" ? prev : items[0].id));
        }
    }, [containerRef]);

    useEffect((): (() => void) | undefined => {
        scanHeadings();

        const node = containerRef.current;
        if (!node) return undefined;

        const observer = new MutationObserver((): void => {
            scanHeadings();
        });
        observer.observe(node, { childList: true, subtree: true });

        return (): void => {
            observer.disconnect();
        };
    }, [containerRef, content, scanHeadings]);

    // 2. Scroll-spy tracking
    const updateActiveHeading = useCallback((): void => {
        if (headings.length === 0 || isClickScrollingRef.current) return;

        const activationOffset = Math.max(120, window.innerHeight * 0.35);
        let currentActive = headings[0].id;

        for (const heading of headings) {
            const escapedId = CSS.escape(heading.id);
            const el =
                containerRef.current?.querySelector(`#${escapedId}`) ??
                document.getElementById(heading.id);

            if (!el) continue;

            const rect = el.getBoundingClientRect();
            if (rect.top <= activationOffset) {
                currentActive = heading.id;
            } else {
                break;
            }
        }

        setActiveId(currentActive);
    }, [headings, containerRef]);

    useEffect((): (() => void) | undefined => {
        if (headings.length === 0) {
            return undefined;
        }

        const scrollContainer = getScrollContainer(containerRef.current);
        const target = scrollContainer === window ? window : scrollContainer;

        let ticking = false;
        const handleScroll = (): void => {
            if (isClickScrollingRef.current) return;

            if (!ticking) {
                window.requestAnimationFrame((): void => {
                    if (!isClickScrollingRef.current) {
                        updateActiveHeading();
                    }
                    ticking = false;
                });
                ticking = true;
            }
        };

        target.addEventListener("scroll", handleScroll, { passive: true });
        updateActiveHeading();

        return (): void => {
            target.removeEventListener("scroll", handleScroll);
            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
            }
        };
    }, [headings, containerRef, updateActiveHeading]);

    // 3. Keep sliding indicator and sidebar list in sync
    useEffect((): void => {
        const el = activeId !== "" ? (itemRefs.current.get(activeId) ?? null) : null;
        if (!el) {
            setIndicator((prev) => ({ ...prev, visible: false }));
            return;
        }

        setIndicator({ top: el.offsetTop, height: el.offsetHeight, visible: true });

        const sidebarContainer = navRef.current?.parentElement;
        if (sidebarContainer && sidebarContainer.scrollHeight > sidebarContainer.clientHeight) {
            const elRect = el.getBoundingClientRect();
            const containerRect = sidebarContainer.getBoundingClientRect();

            const diffTop = elRect.top - (containerRect.top + 16);
            const diffBottom = elRect.bottom - (containerRect.bottom - 16);

            if (diffTop < 0) {
                sidebarContainer.scrollBy({ top: diffTop, behavior: "smooth" });
            } else if (diffBottom > 0) {
                sidebarContainer.scrollBy({ top: diffBottom, behavior: "smooth" });
            }
        }
    }, [activeId, headings]);

    // 4. Click handler with smooth scroll lock
    const scrollToHeading = (id: string): void => {
        const escapedId = CSS.escape(id);
        const el =
            containerRef.current?.querySelector(`#${escapedId}`) ??
            document.getElementById(id);

        if (!el) return;

        isClickScrollingRef.current = true;
        setActiveId(id);

        if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
        }
        scrollTimeoutRef.current = setTimeout((): void => {
            isClickScrollingRef.current = false;
        }, 800);

        const scrollContainer = getScrollContainer(containerRef.current);
        const headerOffset = 80;

        if (scrollContainer === window) {
            const elementPosition = el.getBoundingClientRect().top + window.scrollY;
            window.scrollTo({
                top: elementPosition - headerOffset,
                behavior: "smooth",
            });
        } else if (scrollContainer instanceof HTMLElement) {
            const containerRect = scrollContainer.getBoundingClientRect();
            const elementRect = el.getBoundingClientRect();
            const offsetTop =
                elementRect.top - containerRect.top + scrollContainer.scrollTop - headerOffset;

            scrollContainer.scrollTo({
                top: offsetTop,
                behavior: "smooth",
            });
        }
    };

    if (headings.length === 0) return null;

    const INDENT_WIDTH_REM = 1.0; // Width step per nesting depth in rem

    return (
        <nav ref={navRef} aria-label="Table of contents" className="w-full text-sm select-none">
            <h4 className="font-semibold text-muted-foreground mb-3 text-xs tracking-wider uppercase">
                On This Page
            </h4>
            <div className="relative border-l border-border/60 pl-2">
                {/* Active indicator bar on main root border */}
                <div
                    className="absolute -left-px w-0.5 bg-brand rounded-full transition-all duration-300 ease-out pointer-events-none"
                    style={{
                        top: indicator.top,
                        height: indicator.height,
                        opacity: indicator.visible ? 1 : 0,
                    }}
                />

                <ul className="relative space-y-0.5">
                    {headings.map(({ id, text, level }) => {
                        const isActive = activeId === id;
                        const depth = Math.max(0, level - minLevel);

                        return (
                            <li
                                key={id}
                                ref={(node): void => {
                                    if (node) itemRefs.current.set(id, node);
                                    else itemRefs.current.delete(id);
                                }}
                                className="relative flex items-center"
                                style={{
                                    paddingLeft: depth > 0 ? `${(depth * INDENT_WIDTH_REM).toString()}rem` : undefined,
                                }}
                            >
                                {/* Nested Hierarchy Lines */}
                                {depth > 0 && (
                                    <div
                                        className="absolute top-0 bottom-0 left-0 flex pointer-events-none"
                                        style={{ width: `${(depth * INDENT_WIDTH_REM).toString()}rem` }}
                                        aria-hidden="true"
                                    >
                                        {Array.from({ length: depth }).map((_, i) => {
                                            const isLastLevel = i === depth - 1;
                                            return (
                                                <div
                                                    key={i}
                                                    className="relative h-full"
                                                    style={{ width: `${INDENT_WIDTH_REM.toString()}rem` }}
                                                >
                                                    {/* Vertical guide line */}
                                                    <span
                                                        className={`absolute left-2 top-0 bottom-0 w-px transition-colors duration-200 ${
                                                            isActive
                                                                ? "bg-brand/40"
                                                                : "bg-border/60"
                                                        }`}
                                                    />

                                                    {/* Branch connector curve for the immediate parent */}
                                                    {isLastLevel && (
                                                        <span
                                                            className={`absolute left-2 top-1/2 -translate-y-1/2 w-2 h-px transition-colors duration-200 ${
                                                                isActive
                                                                    ? "bg-brand/50"
                                                                    : "bg-border/60"
                                                            }`}
                                                        />
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                <button
                                    type="button"
                                    title={text}
                                    aria-current={isActive ? "location" : undefined}
                                    onClick={(e): void => {
                                        e.preventDefault();
                                        scrollToHeading(id);
                                    }}
                                    className={`w-full  rounded-md px-2 py-1.5 text-left leading-snug transition-colors duration-200 cursor-pointer hover:bg-muted/80 hover:text-foreground ${
                                        isActive
                                            ? "text-brand font-medium bg-muted/40"
                                            : "text-muted-foreground"
                                    }`}
                                >
                                    {text}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </nav>
    );
};