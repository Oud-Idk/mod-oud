'use client';

import { SessionProvider as SP, signOut, useSession } from "next-auth/react";
import { JSX, ReactNode, useEffect } from "react";

interface ProvidersProps {
    children: ReactNode;
}

const SessionInvalidator = (): null => {
    const { data: session, status } = useSession();

    useEffect(() => {
        if (status === "loading") return;

        if (session?.error === "RefreshAccessTokenError") {
            console.warn("[Auth] Session expired or refresh token invalid. Signing out.");
            void signOut({ redirectTo: "/" });
        }
    }, [session, status]);

    return null;
};

export function SessionProvider({ children }: ProvidersProps): JSX.Element {
    return (
        <SP refetchOnWindowFocus={false}>
            <SessionInvalidator/>
            {children}
        </SP>
    );
}