"use server";

import { revalidatePath } from "next/cache";
import { WelcomeConfig } from "@/features/welcome/types";
import {
    setupVerificationService,
    teardownVerificationService
} from "@/features/welcome/verification";
import { saveWelcomeConfig } from "@/features/welcome/queries";
import { verifyGuildAccess } from "@/features/_shared/guild";

export type SetupVerificationResponse =
    | {
    success: true;
    verificationMessageId: string;
    verificationChannelId: string;
    verificationRoleId: string;
}
    | {
    success: false;
    error: string;
};

export type ActionResponse =
    | { success: true }
    | { success: false; error: string };

export async function saveWelcomeConfigAction(
    guildId: string,
    data: WelcomeConfig
): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        await saveWelcomeConfig(guildId, data);
        revalidatePath(`/dashboard/${guildId}/welcome`);
    } catch (error) {
        console.error("Failed to save welcome config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}

export async function setupVerificationAction(
    guildId: string,
    rawPayload: unknown
): Promise<SetupVerificationResponse> {
    try {
        const data = await setupVerificationService(guildId, rawPayload);
        revalidatePath(`/dashboard/${guildId}/welcome`);

        return {
            success: true,
            ...data,
        };
    } catch (error) {
        console.error("Error setting up server verification:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "An error occurred while communicating with the backend.",
        };
    }
}

export async function teardownVerificationAction(
    guildId: string,
    rawPayload: unknown
): Promise<ActionResponse> {
    try {
        await teardownVerificationService(guildId, rawPayload);
        revalidatePath(`/dashboard/${guildId}/welcome`);

        return { success: true };
    } catch (error) {
        console.error("Error tearing down server verification:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "An error occurred while communicating with the backend.",
        };
    }
}