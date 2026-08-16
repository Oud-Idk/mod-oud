import { JSX, useEffect, useRef } from "react";
import { twMerge } from "tailwind-merge";

export interface TabItem<T extends string> {
    value: T;
    label: string;
}

interface TabsProps<T extends string> {
    tabs: TabItem<T>[];
    activeTab: T;
    onChange: (tab: T) => void;
    className?: string;
}

export function Tabs<T extends string>({
    tabs,
    activeTab,
    onChange,
    className
}: TabsProps<T>): JSX.Element {
    const containerRef = useRef<HTMLDivElement>(null);
    const activeTabRef = useRef<HTMLButtonElement>(null);

    // Auto-scroll active tab into view
    useEffect(() => {
        if (activeTabRef.current) {
            activeTabRef.current.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
                inline: "center",
            });
        }
    }, [activeTab]);

    // Enhanced Mouse Wheel -> Horizontal Scroll
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent): void => {
            if (e.deltaY !== 0) {
                const canScrollLeft = container.scrollLeft > 0;
                const canScrollRight =
                    container.scrollLeft < container.scrollWidth - container.clientWidth;

                // Only intercept wheel if there is actually room to scroll horizontally
                if ((e.deltaY > 0 && canScrollRight) || (e.deltaY < 0 && canScrollLeft)) {
                    e.preventDefault();
                    container.scrollLeft += e.deltaY;
                }
            }
        };

        container.addEventListener("wheel", handleWheel, { passive: false });
        return () =>{  container.removeEventListener("wheel", handleWheel); };
    }, []);

    return (
        <div
            ref={containerRef}
            role="tablist"
            tabIndex={-1}
            className={twMerge(
                // Layout, Border, & Top Padding to prevent focus clipping
                "flex gap-6 border-b border-border mb-2 overflow-x-auto",
                // Scrollbar hiding
                "scrollbar-none [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ",
                className
            )}
        >
            {tabs.map((tab) => {
                const isActive = activeTab === tab.value;
                return (
                    <button
                        key={tab.value}
                        ref={isActive ? activeTabRef : null}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() =>{  onChange(tab.value); }}
                        className={twMerge(
                            "ml-1 mt-1 p-1 text-sm border-b-2 transition-all select-none shrink-0 cursor-pointer focus-ring rounded-t-sm",
                            isActive
                                ? "border-brand text-brand"
                                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                        )}
                    >
                        {tab.label}
                    </button>
                );
            })}
        </div>
    );
}