import NextAuth, { type Session, type Account, type Profile } from "next-auth";
import Discord from "next-auth/providers/discord";
import { type JWT } from "next-auth/jwt";
import { z } from "zod";
import { revalidateTag } from "next/cache";

declare module "next-auth" {
    interface User {
        id?: string;
        name?: string | null;
        email?: string | null;
        image?: string | null;
    }

    interface Session {
        accessToken?: string;
        error?: string;
        user: User;
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        accessToken?: string;
        refreshToken?: string;
        accessTokenExpires?: number;
        error?: string;
        discordId?: string;
    }
}

const discordTokenResponseSchema = z.object({
    access_token: z.string(),
    refresh_token: z.string().optional(),
    expires_in: z.number(),
});

type InFlightEntry = {
    promise: Promise<{
        accessToken: string;
        refreshToken: string;
        accessTokenExpires: number;
    }>;
    timestamp: number;
};

const inFlightMap = new Map<string, InFlightEntry>();

/**
 * Rotates the access token using Discord's OAuth endpoints.
 * Includes concurrency debouncing to prevent single-use token collisions.
 */
async function refreshAccessToken(token: JWT): Promise<JWT> {
    const refreshToken = token.refreshToken;
    const userId = token.discordId ?? token.sub ?? "unknown";

    if (!refreshToken) {
        console.warn("[Auth] No refresh token found. Forcing re-authentication.");
        return { ...token, error: "RefreshAccessTokenError" };
    }

    const now = Date.now();
    const existing = inFlightMap.get(userId);

    if (existing && now - existing.timestamp < 10000) {
        console.log(`[Auth] Parallel token refresh detected for ${userId}. Joining request...`);
        try {
            const result = await existing.promise;
            return { ...token, ...result };
        } catch {
            return { ...token, error: "RefreshAccessTokenError" };
        }
    }

    const refreshPromise = (async () => {
        const url = "https://discord.com/api/oauth2/token";
        const response = await fetch(url, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            method: "POST",
            body: new URLSearchParams({
                client_id: process.env.AUTH_DISCORD_ID ?? "",
                client_secret: process.env.AUTH_DISCORD_SECRET ?? "",
                grant_type: "refresh_token",
                refresh_token: refreshToken,
            }),
        });

        const rawData: unknown = await response.json();

        if (!response.ok) {
            console.error("[Auth] Discord refresh failed:", JSON.stringify(rawData));
            throw new Error("Discord token refresh request failed");
        }

        const parsed = discordTokenResponseSchema.safeParse(rawData);
        if (!parsed.success) {
            console.error("[Auth] Invalid Discord token response:", parsed.error);
            throw new Error("Invalid Discord token response format");
        }

        return {
            accessToken: parsed.data.access_token,
            refreshToken: parsed.data.refresh_token ?? refreshToken,
            accessTokenExpires: Date.now() + parsed.data.expires_in * 1000,
        };
    })();

    inFlightMap.set(userId, { promise: refreshPromise, timestamp: now });

    try {
        const result = await refreshPromise;
        console.log(`[Auth] Successfully rotated Discord access token for ${userId}`);
        return { ...token, ...result };
    } catch (error) {
        console.error(`[Auth] Error rotating Discord token for ${userId}:`, error);
        return { ...token, error: "RefreshAccessTokenError" };
    } finally {
        inFlightMap.delete(userId);
    }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        Discord({
            clientId: process.env.AUTH_DISCORD_ID,
            clientSecret: process.env.AUTH_DISCORD_SECRET,
            authorization: "https://discord.com/oauth2/authorize?scope=identify+guilds",
        }),
    ],
    callbacks: {
        async jwt({ token, account, profile }: {
            token: JWT;
            account?: Account | null;
            profile?: Profile;
        }): Promise<JWT> {
            if (account !== null && account !== undefined) {
                const expiresAt =
                    account.expires_at !== undefined
                        ? account.expires_at * 1000
                        : Date.now() + (account.expires_in ?? 7200) * 1000;

                const discordId = typeof profile?.id === "string"
                    ? profile.id
                    : account.providerAccountId;

                return {
                    ...token,
                    accessToken: account.access_token,
                    refreshToken: account.refresh_token,
                    accessTokenExpires: expiresAt,
                    discordId,
                };
            }

            if (token.accessTokenExpires !== undefined && Date.now() < token.accessTokenExpires) {
                return token;
            }

            return refreshAccessToken(token);
        },
        session({ session, token }: {
            session: Session;
            token: JWT;
        }): Session {
            session.user.id = token.discordId ?? token.sub ?? "";
            session.accessToken = token.accessToken;
            session.error = token.error;
            return session;
        }
    },
    events: {
        async signIn() {
            try {
                revalidateTag("bot-guilds", "max");
            } catch (err) {
                console.error("Failed to revalidate bot-guilds tag:", err);
            }
        },
    },
});

export const { GET, POST } = handlers;