import { DiscordEmbed, Format } from "@/features/_shared/embed";

export type TicketStatus = "OPEN" | "CLOSED";
export type ViewTicketStatus = "ALL" | TicketStatus;

export interface TicketConfig {
    categoryId: string;
    channelId: string;
    postedMessageId?: string;
    ticketRoleId: string;

    enabled: boolean;
    format: Format;
    content: string;
    embed: DiscordEmbed;

    warnThreshold: number;
    deleteThreshold: number;
    bumpEvery: number;

    welcomeMessage: MessageLayout;
}

export interface TicketMessage {
    message_id: string;
    author_id: string;
    content: string;
    created_at: string;
    is_ticket_manager: boolean;
}

export interface TicketHistory {
    ticket_id: number;
    guild_id: string;
    channel_id: string;
    opener_id: string;
    status: TicketStatus;
    created_at: Date;
    closed_at: Date | null;
    last_activity: Date;
    message_count: number;
    messages: TicketMessage[];
}

export interface Ticket {
    id: number;
    channel_id: string;
    opener_id: string;
    status: TicketStatus;
    created_at: string;
    closed_at: string | null;
    message_count: number;
}

export interface MessageLayout {
    enabled: boolean;
    format: Format;
    content: string;
    embed: DiscordEmbed;
}
