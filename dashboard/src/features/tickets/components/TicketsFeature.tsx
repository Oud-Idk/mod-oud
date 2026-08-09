import { getCategoryMap, getGuildChannels, getRoleMap } from "@/features/_shared/channels";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { TicketsBody } from "@/features/tickets/components/TicketsBody";
import {
    deleteTicketMessageAction,
    saveTicketsConfigAction,
    sendTicketMessageAction
} from "@/features/tickets/actions";
import { getTicketConfig } from "@/features/tickets/queries";
import { JSX } from "react";

interface TicketsFeatureProps {
    guildId: string;
}

export async function TicketsFeature({ guildId }: TicketsFeatureProps): Promise<JSX.Element> {
    const [categoryMap, roleMap, channels, ticketConfig] = await Promise.all([
        getCategoryMap(guildId),
        getRoleMap(guildId),
        getGuildChannels(guildId),
        getTicketConfig(guildId),
    ]);

    const onSave = saveTicketsConfigAction.bind(null, guildId);
    const onSendTicketMessage = sendTicketMessageAction.bind(null, guildId);
    const onDeleteTicketMessage = deleteTicketMessageAction.bind(null, guildId);

    return (
        <div className="flex flex-col">
            <DashboardHeader>Tickets Settings</DashboardHeader>
            <TicketsBody
                guildId={guildId}
                categoryMap={categoryMap}
                roleMap={roleMap}
                channels={channels}
                ticketConfig={ticketConfig}
                onSave={onSave}
                onSendTicketMessage={onSendTicketMessage}
                onDeleteTicketMessage={onDeleteTicketMessage}
            />
        </div>
    );
}