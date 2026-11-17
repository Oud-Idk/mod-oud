import "server-only";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getGuildLists } from "@/features/_shared/servers";

const ADMINISTRATOR_PERMISSION = 1n << 3n;
const MANAGE_ROLES_PERMISSION = 1n << 28n;

const discordRoleSchema = z.object({
    id: z.string(),
    name: z.string(),
    position: z.number(),
    managed: z.boolean().default(false),
});

const discordMemberSchema = z.object({
    roles: z.array(z.string()).default([]),
});

/**
 * Validates that:
 * 1. The caller has MANAGE_ROLES or ADMINISTRATOR permission (or is Guild Owner).
 * 2. None of the target roles are managed (@everyone, bot integrations, booster roles).
 * 3. All target roles are strictly lower than the bot's highest role.
 * 4. All target roles are strictly lower than the caller's highest role (unless Guild Owner).
 */
export async function verifyRoleGrantHierarchy(
    guildId: string,
    targetRoleIds: string[]
): Promise<void> {
    const uniqueRoleIds = Array.from(new Set(targetRoleIds.filter((id) => id.trim().length > 0)));
    if (uniqueRoleIds.length === 0) {
        return;
    }

    const session = await auth();
    if (!session?.user) {
        throw new Error("Unauthorized: Please sign in.");
    }

    const accessToken = session.accessToken;
    if (accessToken === undefined) {
        throw new Error("Unauthorized: Missing access token.");
    }

    const botToken = process.env.DISCORD_TOKEN;
    if (botToken === undefined) {
        throw new Error("Server misconfigured: DISCORD_TOKEN is missing.");
    }

    const { mutualGuilds } = await getGuildLists(accessToken);
    const guild = mutualGuilds.find((g) => g.id === guildId);
    if (!guild) {
        throw new Error("Forbidden: You do not have access to manage this server.");
    }

    const isOwner = guild.owner === true;
    const permissions = BigInt(guild.permissions);
    const hasRolePermission =
        isOwner ||
        (permissions & ADMINISTRATOR_PERMISSION) !== 0n ||
        (permissions & MANAGE_ROLES_PERMISSION) !== 0n;

    if (!hasRolePermission) {
        throw new Error(
            "Forbidden: You need the 'Manage Roles' permission to configure role rewards or actions."
        );
    }

    const callerId = session.user.id;
    if (callerId === undefined) {
        throw new Error("Unauthorized: Please sign in.");
    }

    const headers = { Authorization: `Bot ${botToken}` };
    const [rolesRes, botMemberRes, callerMemberRes] = await Promise.all([
        fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
            headers,
            next: { revalidate: 30 },
        }),
        fetch(`https://discord.com/api/v10/guilds/${guildId}/members/@me`, {
            headers,
            next: { revalidate: 30 },
        }),
        isOwner
            ? Promise.resolve(null)
            : fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${callerId}`, {
                headers,
                next: { revalidate: 30 },
            }),
    ]);

    if (!rolesRes.ok) {
        throw new Error("Failed to fetch server roles from Discord.");
    }
    if (!botMemberRes.ok) {
        throw new Error("Failed to fetch bot member status from Discord.");
    }

    const rolesRaw: unknown = await rolesRes.json();
    const allRoles = z.array(discordRoleSchema).parse(rolesRaw);
    const rolesMap = new Map(allRoles.map((r) => [r.id, r]));

    const botMemberRaw: unknown = await botMemberRes.json();
    const botMember = discordMemberSchema.parse(botMemberRaw);

    const botTopPosition = Math.max(
        0,
        ...botMember.roles.map((id) => rolesMap.get(id)?.position ?? 0)
    );

    let callerTopPosition = Infinity;
    if (!isOwner && callerMemberRes) {
        if (!callerMemberRes.ok) {
            throw new Error("Failed to verify your member roles in this server.");
        }
        const callerMemberRaw: unknown = await callerMemberRes.json();
        const callerMember = discordMemberSchema.parse(callerMemberRaw);
        callerTopPosition = Math.max(
            0,
            ...callerMember.roles.map((id) => rolesMap.get(id)?.position ?? 0)
        );
    }

    for (const roleId of uniqueRoleIds) {
        // Disallow @everyone
        if (roleId === guildId) {
            throw new Error("The @everyone role cannot be granted or assigned.");
        }

        const role = rolesMap.get(roleId);
        if (!role) {
            throw new Error(`Role ID ${roleId} was not found on this server.`);
        }

        if (role.managed) {
            throw new Error(
                `Role "${role.name}" is managed by an integration or booster reward and cannot be granted.`
            );
        }

        if (role.position >= botTopPosition) {
            throw new Error(
                `Role "${role.name}" is at or above the bot's highest role in the server hierarchy.`
            );
        }

        if (!isOwner && role.position >= callerTopPosition) {
            throw new Error(
                `Role "${role.name}" is higher than or equal to your own highest role. You cannot assign roles above your rank.`
            );
        }
    }
}