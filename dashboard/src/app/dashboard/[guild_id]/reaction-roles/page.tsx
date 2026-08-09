import { ReactionRolesFeature } from "@/features/reaction-roles";
import { JSX} from "react";

export interface PageProps {
    params: Promise<{ guild_id: string }>;
    searchParams: Promise<{ id?: string }>;
}

export default async function ReactionRolesPage({ params, searchParams }: PageProps): Promise<JSX.Element> {
    const { guild_id } = await params;
    const { id: activeId } = await searchParams;

    return <ReactionRolesFeature guildId={guild_id} activeId={activeId} />;
}