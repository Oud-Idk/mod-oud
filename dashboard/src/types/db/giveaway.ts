import { Format } from "@/types/db";
import { DiscordEmbed } from "@/types/embed";

export interface Giveaway {
    id: number;
    guild_id: string;
    host_id: string;
    channel_id?: string;
    message_id?: string;
    prize: string;
    winner_count: number;
    end_time: string;
    is_finished: boolean;
    format: Format;
    embed?: DiscordEmbed;
    content?: string;
}