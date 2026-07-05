"use client";

import { LevelReward } from "@/utils/db/leveling";
import { getAvailableRoleOptions } from "@/utils/utils";
import { RuleConfig, RuleItem } from "@/components/RuleConfig";

export interface LevelRewardsTabProps {
    guildId: string;
    rewards: LevelReward[];
    onSave: (
        rewards: Array<{ levelRequirement: number; rolesToAdd: string[]; removePreviousRoles: boolean }>
    ) => Promise<void>;
    onDelete: (ids: number[]) => Promise<void>;
    roleMap: Record<string, string>;
}

export function RewardTab({
    guildId,
    rewards,
    onSave,
    onDelete,
    roleMap,
}: LevelRewardsTabProps) {
    const rules: RuleItem[] = rewards.map((r) => ({
        id: r.id,
        trigger: r.level_requirement,
        actions: r.roles_to_add,
        flag: r.remove_previous_roles,
    }));

    const availableRoles = getAvailableRoleOptions(roleMap, []);

    const handleSave = async (updates: RuleItem[]) => {
        const payload = updates.map((u) => ({
            levelRequirement: u.trigger,
            rolesToAdd: u.actions,
            removePreviousRoles: !!u.flag,
        }));
        await onSave(payload);
    };

    return (
        <RuleConfig
            guildId={guildId}
            rules={rules}
            onSave={handleSave}
            onDelete={onDelete}
            allActionOptions={availableRoles}
            title="Level Rewards"
            createTitle="Create New Level Reward"
            triggerLabel="Required Level"
            actionsLabel="Roles to Add"
            flagLabel="Remove lower level reward roles"
            activeRulesTitle="Active Level Rewards"
            emptyText="No level rewards configured."
            actionPrefix=""
            flagBadgeLabel="Removes Previous"
            minTrigger={1}
            maxTrigger={100}
            defaultTrigger={5}
        />
    );
}