"use client";

import React, { useState, useCallback, JSX } from "react";
import { useParams, useRouter } from "next/navigation";
import { ConfigListLayout } from "@/components/dashboard/ConfigListLayout";
import { BadWordCreateModal } from "./BadWordCreateModal";
import { BadWordRulesetConfig } from "./BadWordRulesetConfig";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { BadWordRuleset, saveBadWordRulesetInputSchema } from "@/features/message-filtering/types";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/inputs/Button";
import { toast } from "sonner";

type SaveableBadWordRuleset = Omit<BadWordRuleset, "created_at" | "updated_at" | "guild_id" | "id"> & {
    id?: string;
};

interface BadWordsBodyProps {
    rulesets: BadWordRuleset[];
    activeRuleset: BadWordRuleset | null;
    channelMap: Record<string, string>;
    roleMap?: Record<string, string>;
    onSave: (ruleset: SaveableBadWordRuleset) => Promise<BadWordRuleset>;
    onDelete: (id: string) => Promise<void>;
}

export function BadWordTab({
    rulesets,
    activeRuleset,
    channelMap,
    roleMap,
    onSave,
    onDelete,
}: BadWordsBodyProps): JSX.Element {
    const router = useRouter();
    const params = useParams();
    if (typeof params.guild_id !== "string") {
        throw new Error("Missing or invalid guild_id parameter");
    }

    const guildId = params.guild_id;

    const {
        config,
        setConfig,
        isPending,
        isDirty,
        handleSave: originalHandleSave,
        handleCancel,
    } = useConfigForm<BadWordRuleset | null>({
        initialConfig: activeRuleset,
        onSave: async (updatedConfig) => {
            if (updatedConfig) await onSave(updatedConfig);
        },
    });

    const handleSave = useCallback((): void => {
        if (!config) return;
        const result = saveBadWordRulesetInputSchema.safeParse(config);
        if (!result.success) {
            toast.error(result.error.issues[0].message);
            return;
        }
        originalHandleSave();
    }, [config, originalHandleSave]);

    const handleChange = useCallback((updated: Partial<SaveableBadWordRuleset>) => {
        setConfig(config ? { ...config, ...updated } : null);
    }, [setConfig, config]);

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    return (
        <>
            <ConfigListLayout<BadWordRuleset>
                title="Rulesets"
                onCreateClick={() => { setIsCreateModalOpen(true); }}
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
                            onClick={() => { router.push(`/dashboard/${guildId}/message-filtering?id=${ruleset.id}`); }}
                            className={cn(
                                "w-full flex flex-col text-left p-3 rounded-md transition-all cursor-pointer border focus-ring",
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
                                {patternCount === 1 ? "1 Pattern" : `${patternCount.toString()} Patterns`} • {ruleset.actions.join(", ")}
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
                        <Button onClick={() => { setIsCreateModalOpen(true); }}>
                            Create Your First Ruleset
                        </Button>
                    </div>
                }
            >
                {config && (
                    <BadWordRulesetConfig
                        config={config}
                        channelMap={channelMap}
                        roleMap={roleMap}
                        isPending={isPending}
                        onDelete={onDelete}
                        onChange={handleChange}
                    />
                )}
            </ConfigListLayout>

            <BadWordCreateModal
                isOpen={isCreateModalOpen}
                onClose={() => { setIsCreateModalOpen(false); }}
                onSave={onSave}
            />
        </>
    );
}