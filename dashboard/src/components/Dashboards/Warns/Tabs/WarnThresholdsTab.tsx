"use client";

import { deleteWarnThresholds, saveWarnThresholdsAction } from "@/actions/warns";
import { RuleConfig, RuleItem } from "@/components/RuleConfig";
import { WarnThreshold } from "@/types/db";
import { ModerationAction } from "@/types";

export interface WarnThresholdTabProps {
    guildId: string;
    thresholds: WarnThreshold[];
    roleMap: Record<string, string>;
}

export function WarnThresholdTab({
    guildId,
    thresholds,
    roleMap
}: WarnThresholdTabProps) {
    // Map db schema to UI RuleItem
    const rules: RuleItem[] = thresholds.map((t) => ({
        id: t.id,
        trigger: t.warn_count,
        actions: t.action_type || [],
        flag: t.duration !== null,
        rolesToAdd: t.roles_to_add || null,
        rolesToRemove: t.roles_to_remove || null,
    }));

    const punishmentOptions = [
        { value: "TIMEOUT", label: "Timeout User" },
        { value: "KICK", label: "Kick User" },
        { value: "BAN", label: "Ban User" },
        { value: "ROLE_REMOVE", label: "Remove Role" },
        { value: "ROLE_ADD", label: "Add Role" },
        { value: "ROLE_REMOVE_ALL", label: "Remove All Roles" },
    ];

    const handleSave = async (updatedRules: RuleItem[]) => {
        // Map UI RuleItem back to the schema structure expected by saveWarnThresholds
        const mapped = updatedRules.map((u) => ({
            warnCount: u.trigger,
            actionType: u.actions as ModerationAction[],
            rolesToAdd: u.rolesToAdd || null,
            rolesToRemove: u.rolesToRemove || null,
            duration: u.actions.includes("timeout") ? 60 : null, // TODO pls add configurable timeouts
        }));

        await saveWarnThresholdsAction(guildId, mapped);
    };

    const handleDelete = async (ids: number[]) => {
        await deleteWarnThresholds(guildId, ids);
    };

    return (
        <RuleConfig
            guildId={guildId}
            rules={rules}
            onSave={handleSave}
            onDelete={handleDelete}
            allActionOptions={punishmentOptions}
            multiple={true} // Changed to true since actions are now an array
            roleMap={roleMap} // <-- We pass the role mapping here!

            title="Warn Threshold Actions"
            createTitle="Configure New Action Rule"
            triggerLabel="Required Warnings"
            actionsLabel="Action to Take"
            activeRulesTitle="Configured Warning Actions"
            emptyText="No actions set up for warning thresholds yet."
            actionPrefix=""
            minTrigger={1}
            maxTrigger={20}
            defaultTrigger={3}
        />
    );
}