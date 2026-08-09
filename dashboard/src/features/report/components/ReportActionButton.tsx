import React, { JSX } from "react";

interface ReportActionButtonProps {
    children?: React.ReactNode;
    onClick: () => void;
    disabled: boolean;
    color: string
}

export function ReportActionButton({ children, onClick, disabled, color }: ReportActionButtonProps): JSX.Element {
    return <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`px-2 py-0.5 text-xs sm:text-sm rounded text-${color}-500 border border-${color}-500 hover:text-${color}-400 hover:border-${color}-400 transition-all disabled:opacity-50 cursor-pointer`}
    >
        {children} </button>
}