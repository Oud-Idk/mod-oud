export interface GuildStats {
    weeklyModerationCount: number;
    weeklyResolvedTicketCount: number;
    openTicketsCount: number;
}

export interface DiscordGuildDetails {
    id: string;
    name: string;
    icon: string | null;
    approximate_member_count?: number;
    approximate_presence_count?: number;
}