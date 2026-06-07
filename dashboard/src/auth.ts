import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";

// Extend NextAuth's Session type so TypeScript recognizes session.accessToken
declare module "next-auth" {
    interface Session {
        accessToken?: string;
    }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        Discord({
            clientId: process.env.AUTH_DISCORD_ID,
            clientSecret: process.env.AUTH_DISCORD_SECRET,
            // Request standard user identification and guild list scopes
            authorization: "https://discord.com/oauth2/authorize?scope=identify+guilds",
        }),
    ],
    callbacks: {
        async jwt({ token, account }) {
            if (account) {
                // Persist the OAuth access_token inside the encrypted JWT
                token.accessToken = account.access_token;
            }
            return token;
        },
        async session({ session, token }) {
            // Expose the access_token to client/server session checks
            session.accessToken = token.accessToken as string;
            return session;
        },
    },
});

// @ts-ignore
export { GET, POST } from "@/auth";
