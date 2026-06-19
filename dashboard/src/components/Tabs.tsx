import { JSX } from "react";

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
    return (
        <div className="flex space-x-4 border-b border-neutral-800 mb-2">
            {tabs.map((tab) => (
                <button
                    key={tab.value}
                    type="button"
                    onClick={() => onChange(tab.value)}
                    className={`pb-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition select-none ${
                        activeTab === tab.value
                            ? "text-neutral-800 dark:text-neutral-200"
                            : "border-transparent text-neutral-500"
                    }`}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}