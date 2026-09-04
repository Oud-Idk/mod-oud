"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { saveVerificationConfig } from "./queries";
import {
    saveVerificationConfigSchema,
    TeardownVerificationPayload,
    teardownVerificationPayloadSchema,
    type VerificationConfig,
} from "./types";

import {
    setupVerificationService,
    teardownVerificationService,
    type SetupVerificationResult,
} from "./service";
import { MessageLayout, messageLayoutSchema } from "@/features/_shared/embed";

export async function saveVerificationConfigAction(
    guildId: string,
    data: VerificationConfig
): Promise<void> {
    try {
        await verifyGuildAccess(guildId);

        const validatedData = saveVerificationConfigSchema.parse(data);
        await saveVerificationConfig(guildId, validatedData);

        revalidatePath(`/dashboard/${guildId}/verification`);
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
        console.error("Failed to save verification config:", error);
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

        revalidatePath(`/dashboard/${guildId}/verification`);

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

        revalidatePath(`/dashboard/${guildId}/verification`);
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
