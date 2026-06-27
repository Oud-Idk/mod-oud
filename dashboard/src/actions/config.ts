"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth"; // Your Auth.js/NextAuth configuration
import {
    BadWordRulesetRow,
    deleteBadWordRuleset,
    getTicketConfig,
    saveBadWordRuleset,
    saveLeaveConfig,
    saveLevelingConfig,
    saveMessageFilteringConfig,
    saveModerationDMsConfig,
    saveReportConfig,
    saveTicketConfig,
    saveWelcomeConfig
} from "@/utils/db/config";
import { LeaveConfig, LevelingConfig, ReportConfig, TicketConfig } from "@/types/config";
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

export async function saveTicketsConfigAction(guildId: string, data: TicketConfig) {
    try {
        await verifyGuildAccess(guildId);
        await saveTicketConfig(guildId, data);
        revalidatePath(`/dashboard/${guildId}/leave`);
    } catch (error) {
        console.error("Failed to save tickets config:", error);
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
        console.error("Failed to save moderation_old DMs config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}

export async function sendTicketMessageAction(guildId: string, channelId: string) {
    try {
        await verifyGuildAccess(guildId);
        const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";

        const response = await fetch(`${backendUrl}/api/guilds/${guildId}/tickets/send-message`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ channel_id: channelId }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || "Could not instruct the bot to send the message.");
        }

        const data = (await response.json()) as { message_id: string };

        const currentConfig = await getTicketConfig(guildId);
        await saveTicketConfig(guildId, {
            ...currentConfig,
            posted_message_id: data.message_id,
        });

        revalidatePath(`/dashboard/${guildId}/tickets`);
        return data.message_id;
    } catch (error) {
        console.error("Failed to send ticket message:", error);
        throw new Error(error instanceof Error ? error.message : "Could not post ticket panel.");
    }
}

export async function deleteTicketMessageAction(guildId: string, channelId: string, messageId: string) {
    try {
        await verifyGuildAccess(guildId);
        const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";

        const response = await fetch(`${backendUrl}/api/guilds/${guildId}/tickets/delete-message`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ channel_id: channelId, message_id: messageId }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || "Could not instruct the bot to delete the message.");
        }

        const currentConfig = await getTicketConfig(guildId);
        const { posted_message_id, ...rest } = currentConfig;
        await saveTicketConfig(guildId, rest);

        revalidatePath(`/dashboard/${guildId}/tickets`);
    } catch (error) {
        console.error("Failed to delete ticket message:", error);
        throw new Error(error instanceof Error ? error.message : "Could not delete ticket panel.");
    }
}

/**
 * Saves or updates a bad word ruleset row in the database,
 * then revalidates the message filtering page.
 */
export async function saveBadWordRulesetAction(
    guildId: string,
    ruleset: Omit<BadWordRulesetRow, 'createdAt' | 'updatedAt' | 'guildId'> & { id?: string }
): Promise<BadWordRulesetRow> {
    try {
        const savedRow = await saveBadWordRuleset(guildId, ruleset);
        revalidatePath(`/dashboard/${guildId}/message-filtering`);

        return savedRow;
    } catch (error) {
        console.error(`Failed to save bad word ruleset for guild ${guildId}:`, error);
        throw new Error("Could not save ruleset settings. Please try again.");
    }
}

/**
 * Deletes a bad word ruleset row from the database,
 * then revalidates the message filtering page.
 */
export async function deleteBadWordRulesetAction(
    guildId: string,
    id: string
): Promise<void> {
    try {
        await deleteBadWordRuleset(guildId, id);
        revalidatePath(`/dashboard/${guildId}/message-filtering`);
    } catch (error) {
        console.error(`Failed to delete bad word ruleset ${id} for guild ${guildId}:`, error);
        throw new Error("Could not delete ruleset. Please try again.");
    }
}