import React from "react";
import { twMerge } from "tailwind-merge";
import SecondaryButton from "@/components/Inputs/Buttons/SecondaryButton";

interface TextInputProps {
    onSubmit?: () => void;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    className?: string;
    parentClassName?: string;
    submitButtonText?: string;
    disableSubmitButton?: boolean;
    name?: string;
}

export function TextInput({
    onSubmit,
    value,
    onChange,
    placeholder,
    className,
    parentClassName,
    name,
    submitButtonText = "Add",
    disableSubmitButton = false,
}: TextInputProps) {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && onSubmit) {
            e.preventDefault();
            onSubmit();
        }
    };

    return (
        <div className={twMerge("flex gap-2 max-w-xs", parentClassName)}>
            <input
                name={name}
                type="text"
                placeholder={placeholder}
                value={value}
                onChange={onChange}
                onKeyDown={handleKeyDown}
                className={
                    twMerge(
                        "border rounded px-3 py-2 text-sm focus:outline-none flex-1 placeholder-neutral-500 bg-neutral-300/10 border-neutral-500 min-w-0",
                        className,
                    )
                }
            />
            {!disableSubmitButton && (
                <SecondaryButton
                    onClick={() => onSubmit ? onSubmit() : undefined} className="h-full"
                >
                    {submitButtonText} </SecondaryButton>
            )}
        </div>
    );
}