import { JSX} from "react";
import { ReportFeature } from "@/features/report";

export interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function ReportPage({ params }: PageProps): Promise<JSX.Element> {
    const { guild_id } = await params;

    return <ReportFeature guildId={guild_id} />;
}

