import { TargetType } from "@/types/db/index";

export interface XpMultiplier {
    guild_id: string;
    target_id: string;
    target_type: TargetType;
    multiplier: number;
}

export interface LevelReward {
    id: number;
    guild_id: string;
    level_requirement: number;
    roles_to_add: string[];
    remove_previous_roles: boolean;
}