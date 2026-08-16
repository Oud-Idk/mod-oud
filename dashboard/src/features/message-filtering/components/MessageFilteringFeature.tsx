import { getRoleMap, getTextChannelMap } from "@/features/_shared/channels";
import {
    deleteBadWordRulesetAction,
    saveBadWordRulesetAction,
    saveMessageFilteringConfigAction
} from "@/features/message-filtering/actions";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { MessageFilteringBody } from "@/features/message-filtering/components/MessageFilteringBody";
import { getBadWordRulesets, getMessageFilteringConfig } from "@/features/message-filtering/queries";
import { JSX } from "react";

interface MessageFilteringFeatureProps {
    guildId: string;
    rulesetId?: string;
}

export async function MessageFilteringFeature({ guildId, rulesetId }: MessageFilteringFeatureProps): Promise<JSX.Element> {
    const [
        messageFilteringConfig,
        badWordRulesets,
        channelMap,
        roleMap,
    ] = await Promise.all([
        getMessageFilteringConfig(guildId),
        getBadWordRulesets(guildId),
        getTextChannelMap(guildId),
        getRoleMap(guildId),
    ]);

    const activeRuleset = badWordRulesets.find((r) => r.id === rulesetId) ?? null;

    const onSave = saveMessageFilteringConfigAction.bind(null, guildId);
    const onSaveRuleset = saveBadWordRulesetAction.bind(null, guildId);
    const onDeleteRuleset = deleteBadWordRulesetAction.bind(null, guildId);

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
            />
        </div>
    );
}