"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BadWordRulesetRow } from "@/utils/db/config";
import { ConfigListLayout } from "@/components/Dashboards/General/ConfigListLayout";
import { BadWordCreateModal } from "./BadWordCreateModal";
import { BadWordRulesetConfig } from "./BadWordRulesetConfig";
import { useConfigForm } from "@/hooks/useConfigForm";
import PrimaryButton from "@/components/Inputs/Buttons/PrimaryButton";

type SaveableBadWordRuleset = Omit<BadWordRulesetRow, "createdAt" | "updatedAt" | "guildId" | "id"> & {
    id?: string;
};

interface BadWordsBodyProps {
    rulesets: BadWordRulesetRow[];
    activeRuleset: BadWordRulesetRow | null;
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
            <ConfigListLayout<BadWordRulesetRow> title="Rulesets"
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
                            className={`w-full text-left px-3 py-2 rounded text-sm transition block cursor-pointer truncate ${
                                isCurrent
                                    ? "bg-neutral-400/15 hover:bg-neutral-400/20 font-medium"
                                    : "hover:bg-neutral-300/15"
                            }`}
                        >
                            <div className="flex justify-between items-center">
                                <span className="truncate font-semibold">{ruleset.name}</span>
                                <span
                                    className={`text-xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                        ruleset.enabled ? "bg-emerald-500/10 text-emerald-500" : "bg-neutral-500/10 text-neutral-400"
                                    }`}
                                >
                                    {statusText}
                                </span>
                            </div>
                            <div className="text-xs text-zinc-500 truncate mt-0.5">
                                {patternCount === 1 ? "1 Pattern" : `${patternCount} Patterns`} • {ruleset.actions.join(", ")}
                            </div>
                        </button>
                    );
                }}
                noActivePlaceholder={
                    <>
                        <p className="mb-1">Select an active ruleset, or create a new one to begin.</p>
                        <PrimaryButton
                            onClick={() => setIsCreateModalOpen(true)}
                        >
                            Create Your First Ruleset
                        </PrimaryButton>
                    </>
                }
            >
                <BadWordRulesetConfig
                    config={config as BadWordRulesetRow}
                    channelMap={channelMap}
                    roleMap={roleMap}
                    isPending={isPending}
                    onDelete={onDelete}
                    onChange={handleChange}
                    setIsEmpty={setIsEmpty}
                />
            </ConfigListLayout>

            <BadWordCreateModal
                isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} onSave={onSave}
            />
        </>
    );
}