import { JSX, SetStateAction, useEffect } from "react";
import { PlaceholderList } from "@/features/_shared/message-creator/components/PlaceholderList";
import { Pad } from "@/components/layout/Pad";

import { BuilderConfig } from "@/features/_shared/builderConfig";

interface PlaintextEditorProps {
    value: string;
    placeholder?: string;
    placeholderConfig?: BuilderConfig;
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
            {placeholderConfig && placeholderConfig.placeholders.length > 0 &&
                <PlaceholderList config={placeholderConfig}/>}
            <textarea
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                rows={4}
                placeholder={placeholder}
                className={`w-full mb-0 p-2 bg-neutral-300/5 border-neutral-500 border rounded-lg text-sm resize-none font-mono focus:outline-none placeholder-neutral-600 ${value.trim() === "" && !emptyable ? "border-red-700 dark:border-red-300        " : ""}`}
            />
            {value.trim() === "" && !emptyable && (
                <p className="text-red-700 dark:text-red-300">Message cannot be empty.</p>
            )}
        </div>
    );
}