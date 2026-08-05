import { JSX } from "react";
import { Format } from "@/features/_shared/embed";

interface MessageModeSelectorProps {
    format: Format;
    label?: string;
    disabled?: boolean;
    onChange: (format: Format) => void;
}

export function MessageModeSelector({
    format,
    label = "Message Mode",
    disabled = false,
    onChange
}: MessageModeSelectorProps): JSX.Element {
    return (
        <div className="space-y-2 mt-1">
            <label className="text-sm block">
                {label}
            </label>
            <div className="flex space-x-2 bg-neutral-300/5 p-1 rounded border border-neutral-700 w-fit">
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange("TEXT")}
                    className={`px-3 py-1.5 rounded text-xs font-semibold transition select-none ${
                        format === "TEXT"
                            ? "dark:bg-neutral-800 bg-neutral-200"
                            : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                    }`}
                >
                    Plaintext Message
                </button>
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange("EMBED")}
                    className={`px-3 py-1.5 rounded text-xs font-semibold transition select-none ${
                        format === "EMBED"
                            ? "dark:bg-neutral-800 bg-neutral-200"
                            : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                    }`}
                >
                    Rich Embed
                </button>
            </div>
        </div>
    );
}