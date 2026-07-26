import { redirect } from "next/navigation";
import { auth } from "@/auth";

import { DashboardHeader } from "@/components/Dashboards/General/DashboardHeader";
import { CustomCommandsBody } from "@/components/Dashboards/CustomCommands/CustomCommandsBody";
import { getCustomCommands } from "@/utils/db/customCommands";
import { deleteCustomCommandAction, saveCustomCommandAction } from "@/actions/customCommands";
import { getRoleMap, getTextChannelMap } from "@/utils/discord";

export interface PageProps {
    params: Promise<{ guild_id: string }>;
    searchParams: Promise<{ id?: string }>;
}

export default async function CustomCommandsPage({ params, searchParams }: PageProps) {
    const session = await auth();

    if (!session?.user?.id) {
        redirect("/");
    }

    const { guild_id } = await params;
    const { id: activeId } = await searchParams;

    const [commands, channelMap, roleMap] = await Promise.all([
        getCustomCommands(guild_id),
        getTextChannelMap(guild_id),
        getRoleMap(guild_id),
    ]);

    const activeConfig =
        commands.find((c) => String(c.id) === String(activeId)) ||
        commands[0] ||
        null;

    const onSave = saveCustomCommandAction.bind(null, guild_id);
    const onDelete = deleteCustomCommandAction.bind(null, guild_id);

    return (
        <div>
            <DashboardHeader>Custom Commands</DashboardHeader>
            <CustomCommandsBody
                commands={commands}
                activeConfig={activeConfig}
                onSave={onSave}
                onDelete={onDelete}
                channelMap={channelMap}
                roleMap={roleMap}
            />
        </div>
    );
}