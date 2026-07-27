import { Format } from "@/types/db/index";
import { DiscordEmbed } from "@/types/embed";

export interface CustomMessagePayload {
    format: Format;
    content?: string;
    embed?: DiscordEmbed;
}

export interface BirthdayConfig {
    enabled: boolean;
    channelId: string | null;
    announcementHour: number;
    birthdayRoleId: string | null;
    requireYear: boolean;
    messageWithYear: CustomMessagePayload;
    messageWithoutYear: CustomMessagePayload;
}