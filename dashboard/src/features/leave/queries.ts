import { z } from "zod";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import { MemberMessageConfig, memberMessageConfigSchema } from "@/features/welcome/types";

export async function getLeaveConfig(guildId: string): Promise<MemberMessageConfig> {
    const validGuildId = z.string().min(1).parse(guildId);

    const dbLeave = await getGuildConfigField(validGuildId, "leave");
    return memberMessageConfigSchema.parse(dbLeave ?? {});
}

export async function saveLeaveConfig(guildId: string, config: MemberMessageConfig): Promise<void> {
    await saveGuildConfigField(guildId, "leave", config);
}