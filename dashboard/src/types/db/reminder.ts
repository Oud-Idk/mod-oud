import { Format, ReminderType } from "@/types/db/index";

export interface ReminderRow {
    id: string;
    channelId: string;
    format: Format;
    embed: any | null;
    content: string | null;
    rType: ReminderType;
    nextTriggerAt: string; // ISO DateTime string
    daysOfWeek: number[] | null;
    timeStart: string | null;
    timeEnd: string | null;
    intervalSeconds: number | null;
    isActive: boolean;
}

export type SaveableReminder = Omit<ReminderRow, "id"> & {
    id?: string;
};