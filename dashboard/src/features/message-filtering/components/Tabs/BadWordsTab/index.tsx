"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ConfigListLayout } from "@/components/dashboard/ConfigListLayout";
import { BadWordCreateModal } from "./BadWordCreateModal";
import { BadWordRulesetConfig } from "./BadWordRulesetConfig";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { BadWordRuleset } from "@/features/message-filtering/types";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";

type SaveableBadWordRuleset = Omit<BadWordRuleset, "created_at" | "updated_at" | "guild_id" | "id"> & {
    id?: string;
};

interface BadWordsBodyProps {
    rulesets: BadWordRuleset[];
    activeRuleset: BadWordRuleset | null;
    channelMap: Record<string, string>;
    roleMap?: Record<string, string>;
    onSave: (ruleset: SaveableBadWordRuleset) => Promise<any>;
    onDelete: (id: string) => Promise<void>;
}

export function BadWordTab({
    rulesets,
    activeRuleset,
    channelMap,
    roleMap,
    onSave,
    onDelete,
}: BadWordsBodyProps) {
    const router = useRouter();
    const params = useParams();
    const guildId = params?.guild_id as string;

    const {
        config,
        isPending,
        isDirty,
        setIsEmpty,
        handleSave,
        handleCancel,
        handleChange,
    } = useConfigForm<SaveableBadWordRuleset | null>({
        initialConfig: activeRuleset,
        onSave: async (updatedConfig) => {
            if (updatedConfig) await onSave(updatedConfig);
        },
    });

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    return (
        <>
            <ConfigListLayout<BadWordRuleset>
                title="Rulesets"
                onCreateClick={() => setIsCreateModalOpen(true)}
                items={rulesets}
                emptyMessage="No rulesets configured yet."
                hasActiveConfig={!!config}
                isDirty={isDirty}
                isPending={isPending}
                handleSave={handleSave}
                handleCancel={handleCancel}
                renderItem={(ruleset) => {
                    const isCurrent = activeRuleset?.id === ruleset.id;
                    const statusText = ruleset.enabled ? "Active" : "Disabled";
                    const patternCount = ruleset.patterns.length;

                    return (
                        <button
                            key={ruleset.id}
                            onClick={() => router.push(`/dashboard/${guildId}/message-filtering?id=${ruleset.id}`)}
                            className={cn(
                                "w-full flex flex-col text-left p-3 rounded-md transition-all cursor-pointer border",
                                isCurrent
                                    ? "bg-surface-active/50 border-border text-foreground shadow-sm"
                                    : "border-transparent hover:bg-surface-active/60 text-foreground"
                            )}
                        >
                            <div className="flex justify-between items-center gap-2 w-full">
                                <span className="truncate font-semibold text-sm">{ruleset.name}</span>
                                <span
                                    className={cn(
                                        "text-xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0",
                                        ruleset.enabled
                                            ? "text-success"
                                            : "text-muted-foreground"
                                    )}
                                >
                                    {statusText}
                                </span>
                            </div>
                            <div className="text-xs text-muted-foreground truncate mt-1">
                                {patternCount === 1 ? "1 Pattern" : `${patternCount} Patterns`} • {ruleset.actions.join(", ")}
                            </div>
                        </button>
                    );
                }}
                noActivePlaceholder={
                    <div className="max-w-md mx-auto space-y-4">
                        <div className="space-y-1">
                            <h3 className="text-lg font-semibold">No Ruleset Selected</h3>
                            <p className="text-sm text-muted-foreground">
                                Select an active ruleset from the sidebar to edit its patterns, or create a new ruleset to begin filtering.
                            </p>
                        </div>
                        <Button onClick={() => setIsCreateModalOpen(true)}>
                            Create Your First Ruleset
                        </Button>
                    </div>
                }
            >
                <BadWordRulesetConfig
                    config={config as BadWordRuleset}
                    channelMap={channelMap}
                    roleMap={roleMap}
                    isPending={isPending}
                    onDelete={onDelete}
                    onChange={handleChange}
                    setIsEmpty={setIsEmpty}
                />
            </ConfigListLayout>

            <BadWordCreateModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSave={onSave}
            />
        </>
    );
}