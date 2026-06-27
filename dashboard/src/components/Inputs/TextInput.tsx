import React from "react";
import { twMerge } from "tailwind-merge";

interface TextInputProps {
    onSubmit: (e: React.SubmitEvent) => void;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    className?: string;
}

export function TextInput({
    onSubmit,
    value,
    onChange,
    placeholder,
    className,
}: TextInputProps) {
    return <form onSubmit={onSubmit} className={twMerge("flex gap-2 max-w-xs", className)}>
        <input
            type="text"
            placeholder={placeholder}
            value={value}
            onChange={onChange}
            className="border rounded px-3 py-1.5 text-sm focus:outline-none flex-1 placeholder-neutral-500 bg-neutral-300/10 border-neutral-500"
        />
        <button
            type="submit"
            className="px-3 py-1.5 text-sm bg-gray-850 rounded cursor-pointer border hover:bg-neutral-300/10"
        >
            Add
        </button>
    </form>
}