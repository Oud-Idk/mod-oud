"use client";

import React, { JSX, ReactNode } from "react";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { Button } from "@/components/ui/inputs/Button";
import Emphasis from "@/components/layout/Emphasis";

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
}: ConfigListLayoutProps<T>): JSX.Element {
    return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 xl:gap-6 items-stretch mt-4">
            <div className="xl:col-span-1 flex flex-col min-h-70 xl:min-h-100 max-h-105 lg:max-h-none p-4 rounded-lg border border-border bg-surface overflow-hidden">
                <div className="flex justify-between items-center pb-3 border-b border-border-subtle shrink-0">
                    <Emphasis>{title}</Emphasis>
                    <Button onClick={onCreateClick}>{createButtonText}</Button>
                </div>

                {/* List Body */}
                <div className="flex-1 flex flex-col min-h-0 overflow-y-auto mt-3">
                    {items.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-4 border border-dashed border-border-subtle rounded-lg my-1">
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                {emptyMessage}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {items.map((item) => renderItem(item))}
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content Details Panel */}
            <div className="xl:col-span-2 flex flex-col min-h-100 border border-border bg-surface p-4 rounded-lg">
                {!hasActiveConfig ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4">
                        {noActivePlaceholder}
                    </div>
                ) : (
                    children
                )}
            </div>

            {/* Bottom Floating Save Bar */}
            {isDirty && handleSave && handleCancel && (
                <SavePopup
                    handleCancel={handleCancel}
                    handleSave={handleSave}
                    isSaving={isPending}
                />
            )}
        </div>
    );
}