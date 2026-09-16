import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { getRoleMap, getTextChannelMap } from "@/features/_shared/channels";
import { deleteCustomCommandAction, saveCustomCommandAction, saveCustomPrefixAction } from "../actions";
import { CustomCommandsBody } from "@/features/custom-commands/components/CustomCommandsBody";
import { CustomPrefixConfig } from "@/features/custom-commands/components/CustomPrefixConfig";
import { getCustomCommands, getCustomPrefix } from "@/features/custom-commands/queries";
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

    const [commands, channelMap, roleMap, prefixConfig] = await Promise.all([
        getCustomCommands(guildId),
        getTextChannelMap(guildId),
        getRoleMap(guildId),
        getCustomPrefix(guildId),
    ]);

    const activeConfig =
        commands.find((c) => String(c.id) === String(activeId)) ??
        commands.at(0) ??
        null;

    const onSave = saveCustomCommandAction.bind(null, guildId);
    const onDelete = deleteCustomCommandAction.bind(null, guildId);
    const onSavePrefix = saveCustomPrefixAction.bind(null, guildId);

    return (
        <div className="space-y-4">
            <DashboardHeader>Custom Commands</DashboardHeader>
            <CustomPrefixConfig initialConfig={prefixConfig} onSave={onSavePrefix} />
            <CustomCommandsBody
                commands={commands}
                activeConfig={activeConfig}
                onSave={onSave}
                onDelete={onDelete}
                channelMap={channelMap}
                roleMap={roleMap}
                guildId={guildId}
                prefix={prefixConfig.prefix}
            />
        </div>
    );
}