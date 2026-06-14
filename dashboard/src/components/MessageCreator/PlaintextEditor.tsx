import { JSX } from "react";
import { PlaceholderList } from "@/components/Embed/PlaceholderList";

interface PlaintextEditorProps {
    value: string;
    placeholder?: string; // Customizable helper text
    placeholderConfig?: any; // The config for the PlaceholderList (e.g. WELCOME_CONFIG)
    disabled?: boolean;
    onChange: (val: string) => void;
}

export function PlaintextEditor({
    value,
    placeholder = "Enter your message content...",
    placeholderConfig,
    disabled = false,
    onChange
}: PlaintextEditorProps): JSX.Element {
    return (
        <div className="space-y-2">
            <label className="text-sm font-semibold block">
                Message Content
            </label>

            {/* Render placeholder helper tags if a config is passed */}
            {placeholderConfig && <PlaceholderList config={placeholderConfig}/>}

            <textarea
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                rows={4}
                placeholder={placeholder}
                className="w-full p-2 bg-neutral-300/5 border rounded text-sm focus:outline-none focus:border-neutral-500 resize-none font-mono placeholder-neutral-600"
            />
            <p className="text-xs text-neutral-500">
                Supports dynamic placeholders and mentions. </p>
        </div>
    );
}