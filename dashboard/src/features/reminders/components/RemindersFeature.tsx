import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { getTextChannelMap } from "@/features/_shared/channels";
import { getRemindersByChannels } from "../queries";
import { deleteReminderAction, saveReminderAction } from "../actions";
import { RemindersBody } from "./RemindersBody";
import { JSX } from "react";

interface RemindersFeatureProps {
    guildId: string;
    activeReminderId?: string;
}

export async function RemindersFeature({
    guildId,
    activeReminderId,
}: RemindersFeatureProps): Promise<JSX.Element> {
    const channelMap = await getTextChannelMap(guildId);
    const channelIds = Object.keys(channelMap);
    const reminders = await getRemindersByChannels(channelIds);

    const activeReminder = reminders.find((r) => r.id === activeReminderId) ?? null;

    const onSaveReminder = saveReminderAction.bind(null, guildId);
    const onDeleteReminder = deleteReminderAction.bind(null, guildId);

    return (
        <div>
            <DashboardHeader>Reminders</DashboardHeader>
            <RemindersBody
                reminders={reminders}
                activeReminder={activeReminder}
                channelMap={channelMap}
                onSave={onSaveReminder}
                onDelete={onDeleteReminder}
                guildId={guildId}
            />
        </div>
    );
}