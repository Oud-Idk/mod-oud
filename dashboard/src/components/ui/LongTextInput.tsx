import React, { ChangeEvent } from "react";
import { twMerge } from "tailwind-merge";

interface LongTextInputProps {
    name?: string;
    onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
    placeholder?: string;
    value: string;
    className?: string;
    rows?: number;
}

export function LongTextInput({ value, onChange, placeholder, className, name, rows = 3 }: LongTextInputProps) {
    return <textarea
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        rows={rows}
        required
        className={twMerge("w-full border border-neutral-500 rounded p-2 text-sm outline-none focus:border-black dark:focus:border-white resize-none bg-neutral-300/10", className)}
    />
}