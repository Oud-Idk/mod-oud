"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth"; // Your Auth.js/NextAuth configuration
import {
    saveLeaveConfig,
    saveLevelingConfig,
    saveMessageFilteringConfig,
    saveModerationDMsConfig,
    saveReportConfig,
    saveWelcomeConfig
} from "@/utils/db/config";
import { LeaveConfig, LevelingConfig, ReportConfig } from "@/types/config";
import { WelcomeConfig } from "@/types/config/welcome";
import { MessageFilteringConfig } from "@/types/config/messageFiltering";
import { getGuildLists } from "@/utils/servers";
import { ModerationDMsConfig } from "@/types/config/moderationDMs";

/**
 * Authenticates the user and verifies if they have management permissions
 * for the given guild where the bot is also present.
 */
export async function verifyGuildAccess(guildId: string) {
    const session = await auth();

    // 1. Authenticate User
    if (!session || !session.user) {
        throw new Error("Unauthorized: Please sign in.");
    }

    // Retrieve the access token from the session.
    // Ensure your Auth.js config exposes this token in the session object.
    const accessToken = session.accessToken as string | undefined;
    if (!accessToken) {
        throw new Error("Unauthorized: Missing access token.");
    }

    // 2. Authorize User
    // Use your existing function to fetch the guilds the user can manage
    const { mutualGuilds } = await getGuildLists(accessToken);

    // Check if the requested guild is in the mutual guilds list
    const hasAccess = mutualGuilds.some((guild) => guild.id === guildId);
    if (!hasAccess) {
        throw new Error("Forbidden: You do not have permission to manage this server or the bot is not present.");
    }

    return session.user;
}

export async function saveWelcomeConfigAction(guildId: string, data: WelcomeConfig) {
    try {
        await verifyGuildAccess(guildId);
        await saveWelcomeConfig(guildId, data);
        revalidatePath(`/dashboard/${guildId}/welcome`);
    } catch (error) {
        console.error("Failed to save welcome config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}


export async function saveLeaveConfigAction(guildId: string, data: LeaveConfig) {
    try {
        await verifyGuildAccess(guildId);
        await saveLeaveConfig(guildId, data);
        revalidatePath(`/dashboard/${guildId}/leave`);
    } catch (error) {
        console.error("Failed to save leave config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}

export async function saveReportConfigAction(guildId: string, data: ReportConfig) {
    try {
        await verifyGuildAccess(guildId);
        await saveReportConfig(guildId, data);
        revalidatePath(`/dashboard/${guildId}/report`);
    } catch (error) {
        console.error("Failed to save leave config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}

export async function saveMessageFilteringConfigAction(guildId: string, data: MessageFilteringConfig) {
    try {
        await verifyGuildAccess(guildId);
        await saveMessageFilteringConfig(guildId, data);
        revalidatePath(`/dashboard/${guildId}/message-filtering`);
    } catch (error) {
        console.error("Failed to save message filtering config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}

export async function saveLevelingConfigAction(guildId: string, data: LevelingConfig) {
    try {
        await verifyGuildAccess(guildId);
        await saveLevelingConfig(guildId, data);
        revalidatePath(`/dashboard/${guildId}/leveling`);
    } catch (error) {
        console.error("Failed to delete leveling config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not delete configuration.");
    }
}

export async function saveModerationDMsConfigAction(guildId: string, data: ModerationDMsConfig) {
    try {
        await verifyGuildAccess(guildId);
        await saveModerationDMsConfig(guildId, data);
        revalidatePath(`/dashboard/${guildId}/moderation-dms`);
    } catch (error) {
        console.error("Failed to save moderation DMs config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}