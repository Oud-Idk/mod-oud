import { JSX } from "react";

interface PartialPlaceholder {
    key: string;
    label: string;
}

interface PlaceholderBuilderConfig {
    placeholders: PartialPlaceholder[];
}

interface PlaceholderListProps {
    config: PlaceholderBuilderConfig;
}

export const PlaceholderList = ({ config }: PlaceholderListProps): JSX.Element | null => {
    if (config.placeholders.length === 0) return null;

    return (
        <div className="p-3 rounded-lg border border-border bg-surface mb-2">
            <h3 className="mb-2 text-foreground">
                Available Placeholders
            </h3>
            <div className="flex flex-wrap gap-1.5">
                {config.placeholders.map((p) => (
                    <span
                        key={p.key}
                        title={p.label}
                        className="px-2 py-0.5 rounded border border-border bg-surface-muted text-xs font-mono text-foreground inline-flex items-center cursor-help hover:border-foreground/30 transition-colors select-none"
                    >
                        <span className="text-muted-foreground">{'{'}</span>
                        <span>{p.key}</span>
                        <span className="text-muted-foreground">{'}'}</span>
                    </span>
                ))}
            </div>
        </div>
    );
};