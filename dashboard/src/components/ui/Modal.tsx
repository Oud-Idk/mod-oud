import React, { ReactNode } from "react";

interface ModalProps {
    children: ReactNode;
    onClose: () => void;
    headerText: string;
}

export function Modal({ children, onClose, headerText }: ModalProps) {
    const onBgClick = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        onClose();
    }

    const onOtherClick = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    }
    return <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onBgClick}
    >
        <div
            className="bg-white dark:bg-black border border-neutral-500 rounded-xl max-w-xl w-full overflow-hidden shadow-xl py-4 px-6 mx-4"
            onClick={onOtherClick}
        >
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">{headerText}</h3>
                <button
                    onClick={onClose}
                    className="text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-400 cursor-pointer w-4 text-xl transition-all"
                >
                    ✕
                </button>
            </div>
            <div className="mt-1">
                {children}
            </div>
        </div>
    </div>
}