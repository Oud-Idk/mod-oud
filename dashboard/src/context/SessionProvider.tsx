'use client';

import { SessionProvider as SP, signOut, useSession } from "next-auth/react";
import { ReactNode, useEffect } from "react";

interface ProvidersProps {
    children: ReactNode;
}

const SessionInvalidator = () => {
    const { data: session, status } = useSession();

    useEffect(() => {
        if (status === "loading") return;

        if (session === null) {
            void signOut({ redirect: false });
        }
    }, [session, status]);

    return null;
};

export function SessionProvider({ children }: ProvidersProps) {
    return (
        <SP refetchOnWindowFocus={false}>
            <SessionInvalidator/>
            {children}
        </SP>
    );
}