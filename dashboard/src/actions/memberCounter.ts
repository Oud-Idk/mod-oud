"use server";

import { CounterChannel } from "@/types/db/config";

interface AutoCreateResponse {
    success: boolean;
    counters?: CounterChannel[];
    error?: string;
}

export async function setupMemberCounterChannelsAction(
    guildId: string,
    counters: CounterChannel[]
): Promise<AutoCreateResponse> {
    const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";

    try {
        const response = await fetch(`${backendUrl}/api/guilds/${guildId}/member-counter/setup`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ counters }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error(response);
            throw new Error(errorData.message || "Failed to create category and channels via bot backend.");
        }

        const data = await response.json();

        return {
            success: true,
            counters: data.counters,
        };
    } catch (error: any) {
        console.error("[setupMemberCounterChannelsAction Error]:", error);
        return {
            success: false,
            error: error.message || "An unexpected error occurred while creating channels.",
        };
    }
}