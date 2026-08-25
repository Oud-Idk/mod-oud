import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader"; // Generic UI
import { getRoleMap, getTextChannelMap } from "@/features/_shared/channels"; // Infrastructure helper
import { deleteCustomCommandAction, saveCustomCommandAction } from "../actions";
import { CustomCommandsBody } from "@/features/custom-commands/components/CustomCommandsBody";
import { getCustomCommands } from "@/features/custom-commands/queries";
import { JSX } from "react";

interface CustomCommandsFeatureProps {
    guildId: string;
    activeId?: string;
}

export async function CustomCommandsFeature({
    guildId,
    activeId,
}: CustomCommandsFeatureProps): Promise<JSX.Element> {
    const session = await auth();

    if (session?.user.id === undefined) {
        redirect("/");
    }

    const [commands, channelMap, roleMap] = await Promise.all([
        getCustomCommands(guildId),
        getTextChannelMap(guildId),
        getRoleMap(guildId),
    ]);

    const activeConfig =
        commands.find((c) => String(c.id) === String(activeId)) ??
        commands.at(0) ??
        null;

    const onSave = saveCustomCommandAction.bind(null, guildId);
    const onDelete = deleteCustomCommandAction.bind(null, guildId);

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
                guildId={guildId}
            />
        </div>
    );
}