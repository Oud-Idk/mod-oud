import NextAuth, { type Session, type Account, type Profile } from "next-auth";
import Discord from "next-auth/providers/discord";
import { type JWT } from "next-auth/jwt";
import { z } from "zod";

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

declare global {
    var inFlightRefresh: {
        promise: Promise<{
            accessToken: string;
            refreshToken: string;
            accessTokenExpires: number;
        }>;
        timestamp: number;
    } | undefined;
}

const discordTokenResponseSchema = z.object({
    access_token: z.string(),
    refresh_token: z.string().optional(),
    expires_in: z.number(),
});

/**
 * Rotates the access token using Discord's OAuth endpoints.
 * Includes concurrency debouncing to prevent single-use token collisions.
 */
async function refreshAccessToken(token: JWT): Promise<JWT> {
    const refreshToken = token.refreshToken;

    if (refreshToken === undefined || refreshToken === "") {
        console.warn("[Auth] No refresh token found in current session. Forcing re-authentication.");
        return {
            ...token,
            error: "RefreshAccessTokenError",
        };
    }

    const now = Date.now();

    if (globalThis.inFlightRefresh !== undefined && (now - globalThis.inFlightRefresh.timestamp < 10000)) {
        console.log("[Auth] Parallel token refresh detected. Joining in-flight request...");
        try {
            const result = await globalThis.inFlightRefresh.promise;
            return {
                ...token,
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
                accessTokenExpires: result.accessTokenExpires,
            };
        } catch {
            return {
                ...token,
                error: "RefreshAccessTokenError",
            };
        }
    }

    // Explicit return type on inline async IIFE
    const refreshPromise = (async (): Promise<{
        accessToken: string;
        refreshToken: string;
        accessTokenExpires: number;
    }> => {
        const url = "https://discord.com/api/oauth2/token";
        const response = await fetch(url, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
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

    globalThis.inFlightRefresh = {
        promise: refreshPromise,
        timestamp: now,
    };

    try {
        const result = await refreshPromise;
        console.log("[Auth] Successfully rotated Discord access token (Leader)");
        return {
            ...token,
            ...result,
        };
    } catch (error: unknown) {
        console.error("[Auth] Error attempting to rotate Discord access token:", error);
        return {
            ...token,
            error: "RefreshAccessTokenError",
        };
    } finally {
        globalThis.inFlightRefresh = undefined;
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
});

export const { GET, POST } = handlers;