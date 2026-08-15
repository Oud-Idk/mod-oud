"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { saveWelcomeConfig } from "./queries";
import {
    saveWelcomeConfigSchema,
    TeardownVerificationPayload,
    teardownVerificationPayloadSchema,
    type WelcomeConfig,
} from "./types";

import {
    setupVerificationService,
    teardownVerificationService,
} from "./verification";
import { MessageLayout, messageLayoutSchema } from "@/features/_shared/embed";

export interface SetupVerificationResult {
    verificationMessageId: string;
    verificationChannelId: string;
    verificationRoleId: string;
};

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
            throw new Error(error.issues[0].message);
        }
        console.error("Failed to save welcome config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}

export async function setupVerificationAction(
    guildId: string,
    rawPayload: MessageLayout
): Promise<SetupVerificationResult> {
    try {
        await verifyGuildAccess(guildId);

        const validatedPayload = messageLayoutSchema.parse(rawPayload);
        const data = await setupVerificationService(guildId, validatedPayload);

        revalidatePath(`/dashboard/${guildId}/welcome`);

        return data;
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
        console.error("Error setting up server verification:", error);
        throw new Error(
            error instanceof Error ? error.message : "An error occurred while communicating with backend."
        );
    }
}

export async function teardownVerificationAction(
    guildId: string,
    rawPayload: TeardownVerificationPayload
): Promise<void> {
    try {
        await verifyGuildAccess(guildId);

        const payload = teardownVerificationPayloadSchema.parse(rawPayload);
        await teardownVerificationService(guildId, payload);

        revalidatePath(`/dashboard/${guildId}/welcome`);
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
        console.error("Error tearing down server verification:", error);
        throw new Error(
            error instanceof Error ? error.message : "An error occurred while communicating with backend."
        );
    }
}