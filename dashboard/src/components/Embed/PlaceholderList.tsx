import { BuilderConfig } from "@/types/builder";

interface PlaceholderListProps {
    config: BuilderConfig;
}

export const PlaceholderList = ({ config }: PlaceholderListProps) => {
    return (
        <div className="p-3 rounded-lg border border-neutral-500 mb-2">
            <h3 className="text-xs font-bold uppercase mb-2 tracking-wider">
                Available Placeholders </h3>
            <div className="flex flex-wrap gap-2">
                {config.placeholders.map((p) => (
                    <span
                        key={p.key}
                        title={p.label}
                        className="px-2 py-1 rounded text-xs font-mono border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 flex items-center cursor-help hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                    >
                        {"{"}{p.key}{"}"}
                    </span>
                ))}
            </div>
        </div>
    );
};