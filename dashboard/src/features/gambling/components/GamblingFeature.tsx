import { JSX } from "react";
import { getGamblingConfig } from "@/features/gambling/queries";
import { saveGamblingConfigAction } from "@/features/gambling/actions";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { GamblingBody } from "@/features/gambling/components/GamblingBody";

interface GamblingFeatureProps {
    guildId: string;
}

export async function GamblingFeature({ guildId }: GamblingFeatureProps): Promise<JSX.Element> {
    const gamblingConfig = await getGamblingConfig(guildId);
    const onSave = saveGamblingConfigAction.bind(null, guildId);

    return (
        <>
            <DashboardHeader>Gambling</DashboardHeader>
            <GamblingBody gamblingConfig={gamblingConfig} onSave={onSave} />
        </>
    );
}
