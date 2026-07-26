"use client";

import React, { ReactNode } from "react";
import { Pad } from "@/components/Layout/Pad";
import { SavePopup } from "@/components/Dashboards/General/SavePopup";
import PrimaryButton from "@/components/Inputs/Buttons/PrimaryButton";

interface ConfigListLayoutProps<T> {
    title: string;
    createButtonText?: string;
    onCreateClick: () => void;

    items: T[];
    renderItem: (item: T) => ReactNode;
    emptyMessage?: string;

    hasActiveConfig: boolean;
    noActivePlaceholder: ReactNode;

    isDirty?: boolean;
    isPending?: boolean;
    handleSave?: () => void;
    handleCancel?: () => void;

    children: ReactNode;
}

export function ConfigListLayout<T>({
    title,
    createButtonText = "+ Create",
    onCreateClick,
    items,
    renderItem,
    emptyMessage = "No items configured yet.",
    hasActiveConfig,
    noActivePlaceholder,
    isDirty = false,
    isPending = false,
    handleSave,
    handleCancel,
    children,
}: ConfigListLayoutProps<T>) {
    return (
        <div className="items-start mt-4 shrink">
            <div className="md:col-span-1 flex flex-col min-h-70 max-h-70 p-4 rounded-lg border overflow-hidden">
                <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-sm font-semibold uppercase tracking-wider">{title}</span>
                    <PrimaryButton onClick={onCreateClick}>{createButtonText}</PrimaryButton>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 mt-4">
                    {items.length === 0 ? (
                        <p className="text-xs py-2">{emptyMessage}</p>
                    ) : (
                        items.map((item) => renderItem(item))
                    )}
                </div>
            </div>

            <Pad/>

            <div className="md:col-span-3 border border-zinc-850 p-6 rounded-lg">
                {!hasActiveConfig ? (
                    <div className="text-center py-12 space-y-3">
                        {noActivePlaceholder}
                    </div>
                ) : (
                    children
                )}
            </div>

            {/* Bottom Floating Save Bar */}
            {isDirty && handleSave && handleCancel && (
                <SavePopup
                    handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending}
                />
            )}
        </div>
    );
}