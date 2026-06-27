import { JSX, useEffect, useRef } from "react";

export interface TabItem<T extends string> {
    value: T;
    label: string;
}

interface TabsProps<T extends string> {
    tabs: TabItem<T>[];
    activeTab: T;
    onChange: (tab: T) => void;
}

export function Tabs<T extends string>({
    tabs,
    activeTab,
    onChange
}: TabsProps<T>): JSX.Element {
    const containerRef = useRef<HTMLDivElement>(null);
    const activeTabRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (activeTabRef.current) {
            activeTabRef.current.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
                inline: "center",
            });
        }
    }, [activeTab]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            if (e.deltaY !== 0) {
                e.preventDefault();
                // noinspection JSSuspiciousNameCombination
                container.scrollLeft += e.deltaY;
            }
        };

        container.addEventListener("wheel", handleWheel, { passive: false });

        return () => {
            container.removeEventListener("wheel", handleWheel);
        };
    }, []);

    return (
        <div
            ref={containerRef}
            className="flex space-x-4 border-b border-neutral-800 mb-2 overflow-x-auto scrollbar-none [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
            {tabs.map((tab) => {
                const isActive = activeTab === tab.value;
                return (
                    <button
                        key={tab.value}
                        ref={isActive ? activeTabRef : null}
                        type="button"
                        onClick={() => onChange(tab.value)}
                        className={`pb-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition select-none shrink-0 ${
                            isActive
                                ? "text-neutral-800 dark:text-neutral-200"
                                : "border-transparent text-neutral-500"
                        }`}
                    >
                        {tab.label}
                    </button>
                );
            })}
        </div>
    );
}