"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { saveWelcomeConfig } from "./queries";
import {
    saveWelcomeConfigSchema,
    setupVerificationPayloadSchema,
    teardownVerificationPayloadSchema,
    type WelcomeConfig,
} from "./types";

import {
    setupVerificationService,
    teardownVerificationService,
} from "./verification";

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

        const validatedData = saveWelcomeConfigSchema.parse(data);
        await saveWelcomeConfig(guildId, validatedData);

        revalidatePath(`/dashboard/${guildId}/welcome`);
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0]?.message || "Invalid welcome configuration.");
        }
        console.error("Failed to save welcome config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}

export async function setupVerificationAction(
    guildId: string,
    rawPayload: unknown
): Promise<SetupVerificationResponse> {
    try {
        await verifyGuildAccess(guildId);

        const validatedPayload = setupVerificationPayloadSchema.parse(rawPayload);
        const data = await setupVerificationService(guildId, validatedPayload);

        revalidatePath(`/dashboard/${guildId}/welcome`);

        return {
            success: true,
            ...data,
        };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return {
                success: false,
                error: error.issues[0]?.message || "Invalid setup payload.",
            };
        }
        console.error("Error setting up server verification:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "An error occurred while communicating with backend.",
        };
    }
}

export async function teardownVerificationAction(
    guildId: string,
    rawPayload: unknown
): Promise<ActionResponse> {
    try {
        await verifyGuildAccess(guildId);

        const validatedPayload = teardownVerificationPayloadSchema.parse(rawPayload);
        await teardownVerificationService(guildId, validatedPayload);

        revalidatePath(`/dashboard/${guildId}/welcome`);

        return { success: true };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return {
                success: false,
                error: error.issues[0]?.message || "Invalid teardown payload.",
            };
        }
        console.error("Error tearing down server verification:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "An error occurred while communicating with backend.",
        };
    }
}