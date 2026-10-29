import { redirect } from "next/navigation";
import { JSX } from "react";
import { auth } from "@/lib/auth";
import { LoggedInView } from "@/features/overview";

export default async function ServersPage(): Promise<JSX.Element> {
    const session = await auth();

    if (session === null) {
        redirect("/");
    }

    return (
        <main
            className="flex-1 text-foreground flex flex-col antialiased">
            <div className="flex-1 w-full mx-auto flex flex-col items-center">
                <LoggedInView session={session} />
            </div>
        </main>
    );
}
