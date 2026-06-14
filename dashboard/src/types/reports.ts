export interface ReportedMessage {
    id: number;
    guild_id: string;
    channel_id: string;
    message_id: string;
    author_name: string;
    reporter_name: string;
    message_content: string;
    attachment_url: string | null;
    reason: string;
    status: 'under_review' | 'actioned' | 'dismissed';
    moderator_id: string | null;
    moderator_notes: string | null;
    created_at: string;
    resolved_at: string | null;
}

// Matches your Rust struct
export interface ReportedMessagePayload {
    message_id: string;
    channel_id: string;
    reporter_id: string;
    author_id: string;
    reason: string;
    content: string;
    attachment_url: string;
}