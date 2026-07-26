import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { JWT } from "next-auth/jwt";

declare module "next-auth" {
    interface Session {
        accessToken?: string;
        error?: string;
        user: {
            id?: string;
            name?: string | null;
            email?: string | null;
            image?: string | null;
        };
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

// Global state tracker to safely share the in-flight promise across parallel HTTP requests
const globalForAuth = global as unknown as {
    inFlightRefresh?: {
        promise: Promise<{
            accessToken: string;
            refreshToken: string;
            accessTokenExpires: number;
        }>;
        timestamp: number;
    };
};


/**
 * Rotates the access token using Discord's OAuth endpoints.
 * Includes concurrency debouncing to prevent single-use token collisions.
 */
async function refreshAccessToken(token: JWT) {
    const refreshToken = token.refreshToken;

    // If no refresh token exists, do not call Discord.
    if (!refreshToken) {
        console.warn("[Auth] No refresh token found in current session. Forcing re-authentication.");
        return {
            ...token,
            error: "RefreshAccessTokenError",
        };
    }

    const now = Date.now();

    // If another request is currently refreshing the token (started < 10 seconds ago),
    // wait for its result instead of firing a concurrent duplicate request.
    if (globalForAuth.inFlightRefresh && (now - globalForAuth.inFlightRefresh.timestamp < 10000)) {
        console.log("[Auth] Parallel token refresh detected. Joining in-flight request...");
        try {
            const result = await globalForAuth.inFlightRefresh.promise;
            return {
                ...token,
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
                accessTokenExpires: result.accessTokenExpires,
            };
        } catch (e) {
            return {
                ...token,
                error: "RefreshAccessTokenError",
            };
        }
    }

    // We are the first request (the leader). Initiate the refresh request to Discord.
    const refreshPromise = (async () => {
        const url = "https://discord.com/api/oauth2/token";
        const response = await fetch(url, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            method: "POST",
            body: new URLSearchParams({
                client_id: process.env.AUTH_DISCORD_ID!,
                client_secret: process.env.AUTH_DISCORD_SECRET!,
                grant_type: "refresh_token",
                refresh_token: refreshToken, // FIXED: TS now knows this is strictly a `string`
            }),
        });

        const refreshedTokens = await response.json();

        if (!response.ok) {
            console.error("[Auth] Discord refresh failed:", JSON.stringify(refreshedTokens));
            throw refreshedTokens;
        }

        return {
            accessToken: refreshedTokens.access_token,
            refreshToken: refreshedTokens.refresh_token ?? refreshToken,
            accessTokenExpires: Date.now() + refreshedTokens.expires_in * 1000,
        };
    })();

    // Store the promise in the global context so parallel threads can attach to it
    globalForAuth.inFlightRefresh = {
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
    } catch (error) {
        console.error("[Auth] Error attempting to rotate Discord access token:", error);
        return {
            ...token,
            error: "RefreshAccessTokenError",
        };
    } finally {
        globalForAuth.inFlightRefresh = undefined;
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
        async jwt({ token, account, profile }) { // 👈 Add `profile` parameter here
            if (account) {
                const expiresAt = account.expires_at
                    ? account.expires_at * 1000
                    : Date.now() + (account.expires_in || 7200) * 1000;

                return {
                    ...token,
                    accessToken: account.access_token,
                    refreshToken: account.refresh_token,
                    accessTokenExpires: expiresAt,
                    discordId: (profile?.id as string) ?? account.providerAccountId,
                };
            }

            if (token.accessTokenExpires && Date.now() < (token.accessTokenExpires as number)) {
                return token;
            }

            return refreshAccessToken(token);
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.id = (token.discordId as string) ?? token.sub ?? "";
            }

            session.accessToken = token.accessToken as string | undefined;
            session.error = token.error as string | undefined;
            return session;
        }
    },
});

export const { GET, POST } = handlers;