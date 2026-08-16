import { JSX, SetStateAction, useEffect } from "react";
import { PlaceholderList } from "@/features/_shared/message-creator/components/PlaceholderList";
import { Pad } from "@/components/layout/Pad";

import { BuilderConfig } from "@/features/_shared/builderConfig";
import { LongTextInput } from "@/components/ui/LongTextInput";

interface PlaintextEditorProps {
    value: string;
    placeholder?: string;
    placeholderConfig?: BuilderConfig;
    disabled?: boolean;
    onChange: (val: string) => void;
    setIsEmpty?: (value: SetStateAction<boolean>) => void;
    emptyable?: boolean;
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
    const isEmpty = value.trim() === "" && !emptyable;

    useEffect(() => {
        if (!emptyable && setIsEmpty) {
            setIsEmpty(isEmpty);
        }
    }, [value, emptyable, setIsEmpty, isEmpty]);

    return (
        <div className="space-y-2">
            <Pad amount={0.5}/>
            {placeholderConfig && placeholderConfig.placeholders.length > 0 &&
                <PlaceholderList config={placeholderConfig}/>}

            <LongTextInput
                value={value}
                disabled={disabled}
                onChange={(e) => { onChange(e.target.value); }}
                placeholder={placeholder}
                className={`mb-0 ${isEmpty ? "border-danger-border" : ""}`}
            />

            {/* Aesthetic Error Message */}
            {isEmpty && (
                <div className="flex pl-2 items-center gap-1.5 text-xs font-medium text-danger/90 pt-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
                    <svg
                        className="w-3.5 h-3.5 shrink-0 opacity-80"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                    >
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                    <span>Message cannot be empty.</span>
                </div>
            )}
        </div>
    );
}