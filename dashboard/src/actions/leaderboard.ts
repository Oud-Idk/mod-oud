"use server";

import { verifyGuildAccess } from "@/actions/config";
import { fetchMoreLevels } from "@/utils/db/leaderboard";

export async function fetchMoreLevelsAction(guildId: string, currentLowestXp: number) {
    try {
        await verifyGuildAccess(guildId);
        return await fetchMoreLevels(guildId, currentLowestXp);
    } catch (error) {
        console.error("Failed to fetch edited messages:", error);
        throw new Error("Could not fetch messages.");
    }
}