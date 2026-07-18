import { DashboardHeader } from "@/components/Dashboards/General/DashboardHeader";
import { RemindersBody } from "@/components/Dashboards/Reminders/RemindersBody";
import { getTextChannelMap } from "@/utils/discord";
import { getRemindersByChannels } from "@/utils/db/reminder";
import { deleteReminderAction, saveReminderAction } from "@/actions/reminder";

interface PageProps {
    params: Promise<{ guild_id: string }>;
    searchParams: Promise<{ id?: string }>;
}

export default async function RemindersPage({ params, searchParams }: PageProps) {
    const { guild_id } = await params;
    const { id: reminderId } = await searchParams;

    const [channelMap] = await Promise.all([
        getTextChannelMap(guild_id),
    ]);

    const channelIds = Object.keys(channelMap);
    const reminders = await getRemindersByChannels(channelIds);

    const activeReminder = reminders.find((r) => r.id === reminderId) || null;

    const onSaveReminder = saveReminderAction.bind(null, guild_id);
    const onDeleteReminder = deleteReminderAction.bind(null, guild_id);

    return (
        <div>
            <DashboardHeader>Channel Reminders</DashboardHeader>
            <RemindersBody
                reminders={reminders}
                activeReminder={activeReminder}
                channelMap={channelMap}
                onSave={onSaveReminder}
                onDelete={onDeleteReminder}
            />
        </div>
    );
}