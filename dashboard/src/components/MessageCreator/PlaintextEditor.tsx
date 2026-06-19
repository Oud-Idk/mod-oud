import { JSX, SetStateAction, useEffect } from "react";
import { PlaceholderList } from "@/components/Embed/PlaceholderList";
import { Pad } from "@/components/Pad";

interface PlaintextEditorProps {
    value: string;
    placeholder?: string; // Customizable helper text
    placeholderConfig?: any; // The config for the PlaceholderList (e.g. WELCOME_CONFIG)
    disabled?: boolean;
    onChange: (val: string) => void;
    setIsEmpty?: (value: SetStateAction<boolean>) => void;
    emptyable?: boolean,
}

export function PlaintextEditor({
    value,
    placeholder = "Enter your message content...",
    placeholderConfig,
    disabled = false,
    setIsEmpty,
    onChange,
    emptyable,
}: PlaintextEditorProps): JSX.Element {
    useEffect(() => {
        if (!emptyable && setIsEmpty) {
            setIsEmpty(value.trim() === "" && !emptyable);
        }
    }, [value])

    return (
        <div className="space-y-2">
            <Pad amount={0.5}/>
            {placeholderConfig && <PlaceholderList config={placeholderConfig}/>}
            <textarea
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                rows={4}
                placeholder={placeholder}
                className={`w-full mb-0 p-2 bg-neutral-300/5 border rounded text-sm resize-none font-mono focus:outline-none placeholder-neutral-600 ${value.trim() === "" && !emptyable ? "border-red-500 ring-red-500 focus:ring-2" : ""}`}
            />
            {value.trim() === "" && !emptyable && (
                <p className="text-red-500 text-xs">Message cannot be empty.</p>
            )}
            <p className="text-xs text-neutral-500">
                Supports dynamic placeholders and mentions. </p>
        </div>
    );
}