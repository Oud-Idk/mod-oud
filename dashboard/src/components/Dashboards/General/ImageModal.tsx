"use client";

import { useEffect } from "react";

interface ImageModalProps {
    src: string;
    onClose: () => void;
    alt?: string;
}

export function ImageModal({ src, onClose, alt = "Attachment Preview" }: ImageModalProps) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 "
            onClick={onClose}
        >
            <div className="relative max-w-5xl max-h-[90vh]">
                <img
                    src={src}
                    alt={alt}
                    className="max-w-full max-h-[85vh] object-contain rounded shadow-2xl cursor-default"
                    onClick={(e) => e.stopPropagation()} // Stop click from bubbling up to backdrop
                />
                <button
                    type="button"
                    className="absolute -top-10 -left-15 text-white bg-black/50 hover:bg-black/85 transition-colors p-2 rounded-full cursor-pointer"
                    onClick={onClose}
                    aria-label="Close preview"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"
                        />
                    </svg>
                </button>
            </div>
        </div>
    );
}