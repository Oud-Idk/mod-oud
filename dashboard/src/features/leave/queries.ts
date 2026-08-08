import { z } from "zod";
import {
    LeaveConfig,
    leaveConfigSchema,
    saveLeaveConfigSchema
} from "@/features/leave/types";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

export async function getLeaveConfig(guildId: string): Promise<LeaveConfig> {
    const validGuildId = z.string().min(1).parse(guildId);

    const dbLeave = await getGuildConfigField<unknown>(validGuildId, "leave");
    return leaveConfigSchema.parse(dbLeave ?? {});
}

export async function saveLeaveConfig(guildId: string, configPayload: LeaveConfig): Promise<void> {
    const validGuildId = z.string().min(1).parse(guildId);
    const validConfig = saveLeaveConfigSchema.parse(configPayload);

    await saveGuildConfigField(validGuildId, "leave", validConfig);
}