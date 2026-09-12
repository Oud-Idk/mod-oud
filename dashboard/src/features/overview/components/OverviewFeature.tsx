import { auth } from "@/lib/auth";
import { JSX } from "react";
import { LoggedOutOverview } from "@/features/overview/components/LoggedOutOverview";
import { LoggedInView } from "@/features/overview/components/LoggedInView";

export async function OverviewFeature(): Promise<JSX.Element> {
    const session = await auth();

    return (
        <main
            className="flex-1 text-foreground flex flex-col antialiased">
            <div className="flex-1 w-full mx-auto flex flex-col items-center">
                {session ? <LoggedInView session={session}/> : <LoggedOutOverview/>}
            </div>
        </main>
    );
}