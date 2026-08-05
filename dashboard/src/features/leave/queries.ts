import { z } from "zod";
import {
    LeaveConfig,
    leaveConfigSchema,
    defaultLeaveConfig
} from "@/features/leave/types";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

export async function getLeaveConfig(guildId: string): Promise<LeaveConfig> {
    const validGuildId = z.string().min(1).parse(guildId);

    const dbLeave = await getGuildConfigField<unknown>(validGuildId, "leave");
    if (!dbLeave) return defaultLeaveConfig;

    const result = leaveConfigSchema.safeParse(dbLeave);
    return result.success ? result.data : defaultLeaveConfig;
}

export async function saveLeaveConfig(guildId: string, configPayload: LeaveConfig): Promise<void> {
    const validGuildId = z.string().min(1).parse(guildId);
    const validConfig = leaveConfigSchema.parse(configPayload);

    await saveGuildConfigField(validGuildId, "leave", validConfig);
}