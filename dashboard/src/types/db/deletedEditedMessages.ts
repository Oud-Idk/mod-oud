export interface DeletedMessage {
    id: number;
    message_id: string;
    author_id: string;
    channel_id: string;
    deleted_by_id: string;
    guild_id: string;
    content: string;
    attachment_url: string;
    deleted_at: string;
}

export interface EditedMessage {
    id: number;
    message_id: string;
    author_id: string;
    channel_id: string;
    guild_id: string;
    old_content: string | null;
    new_content: string | null;
    updated_at: string;
}