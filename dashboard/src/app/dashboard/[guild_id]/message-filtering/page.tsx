import { DashboardHeader } from "@/components/Dashboards/General/DashboardHeader";
import { MessageFilteringBody } from "@/components/Dashboards/MessageFiltering/MessageFilteringBody";
import { getChannelMap, getRoleMap } from "@/utils/discord";
import { getBadWordRulesets, getMessageFilteringConfig } from "@/utils/db/config";
import {
    deleteBadWordRulesetAction,
    saveBadWordRulesetAction,
    saveMessageFilteringConfigAction
} from "@/actions/config";

interface PageProps {
    params: Promise<{ guild_id: string }>;
    searchParams: Promise<{ id?: string }>;
}

export default async function MessageFilteringPage({ params, searchParams }: PageProps) {
    const { guild_id } = await params;
    const { id: rulesetId } = await searchParams;

    const [
        messageFilteringConfig,
        badWordRulesets,
        channelMap,
        roleMap,
    ] = await Promise.all([
        getMessageFilteringConfig(guild_id),
        getBadWordRulesets(guild_id),
        getChannelMap(guild_id),
        getRoleMap(guild_id),
    ]);

    const activeRuleset = badWordRulesets.find((r) => r.id === rulesetId) || null;

    const onSave = saveMessageFilteringConfigAction.bind(null, guild_id);

    const onSaveRuleset = saveBadWordRulesetAction.bind(null, guild_id);
    const onDeleteRuleset = deleteBadWordRulesetAction.bind(null, guild_id);

    return (
        <div>
            <DashboardHeader>Message Filtering</DashboardHeader>
            <MessageFilteringBody
                messageFilteringConfig={messageFilteringConfig}
                badWordRulesets={badWordRulesets}
                activeRuleset={activeRuleset}
                onSaveRuleset={onSaveRuleset}
                onDeleteRuleset={onDeleteRuleset}
                channelMap={channelMap}
                roleMap={roleMap}
                onSave={onSave}
                guildId={guild_id}
            />
        </div>
    );
}