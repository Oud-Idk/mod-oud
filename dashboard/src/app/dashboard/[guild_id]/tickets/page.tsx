import { getCategoryMap, getGuildChannels, getRoleMap } from "@/utils/discord"; // Added getRoleMap import
import { DashboardHeader } from "@/components/Dashboards/General/DashboardHeader";
import { TicketsBody } from "@/components/Dashboards/Tickets/TicketsBody";
import { getTicketConfig } from "@/utils/db/config";
import { deleteTicketMessageAction, saveTicketsConfigAction, sendTicketMessageAction } from "@/actions/config";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function TicketsPage({ params }: PageProps) {
    const { guild_id } = await params;

    const [categoryMap, roleMap, channels, ticketConfig] = await Promise.all([
        getCategoryMap(guild_id),
        getRoleMap(guild_id),
        getGuildChannels(guild_id),
        getTicketConfig(guild_id),
    ]);

    const onSave = saveTicketsConfigAction.bind(null, guild_id);
    const onSendTicketMessage = sendTicketMessageAction.bind(null, guild_id);
    const onDeleteTicketMessage = deleteTicketMessageAction.bind(null, guild_id);

    return (
        <div>
            <DashboardHeader>Tickets Settings</DashboardHeader>
            <TicketsBody
                categoryMap={categoryMap}
                roleMap={roleMap} // Pass the roleMap down to the client component
                channels={channels}
                ticketConfig={ticketConfig}
                onSave={onSave}
                onSendTicketMessage={onSendTicketMessage}
                onDeleteTicketMessage={onDeleteTicketMessage}
                guildId={guild_id}
            />
        </div>
    );
}