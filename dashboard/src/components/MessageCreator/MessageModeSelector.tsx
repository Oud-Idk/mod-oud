import { JSX } from "react";

interface MessageModeSelectorProps {
    format: "text" | "embed";
    label?: string; // Accepts any custom label string (e.g., "Message Mode", "Message Mode (Public)")
    disabled?: boolean;
    onChange: (format: "text" | "embed") => void;
}

export function MessageModeSelector({
    format,
    label = "Message Mode",
    disabled = false,
    onChange
}: MessageModeSelectorProps): JSX.Element {
    return (
        <div className="space-y-2">
            <label className="text-sm font-semibold block">
                {label}
            </label>
            <div className="flex space-x-2 bg-neutral-300/5 p-1 rounded border border-neutral-700 w-fit">
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange("text")}
                    className={`px-3 py-1.5 rounded text-xs font-semibold transition select-none ${
                        format === "text"
                            ? "dark:bg-neutral-800 bg-neutral-200"
                            : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                    }`}
                >
                    Plaintext Message
                </button>
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange("embed")}
                    className={`px-3 py-1.5 rounded text-xs font-semibold transition select-none ${
                        format === "embed"
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