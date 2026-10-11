import { LoggedOutOverview } from "@/features/overview/components/LoggedOutOverview";
import { JSX } from "react";

export default function OverviewPage(): JSX.Element {
    return (
        <main
            className="flex-1 text-foreground flex flex-col antialiased">
            <div className="flex-1 w-full mx-auto flex flex-col items-center">
                <LoggedOutOverview />
            </div>
        </main>
    );
}
