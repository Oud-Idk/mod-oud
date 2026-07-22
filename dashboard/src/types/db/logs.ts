import { JoinLeaveAction } from "@/types/db/index";

export interface AutomodLog {
    id: string;
    guild_id: string;
    user_id: string;
    channel_id: string | null;
    message_id: string | null;
    rule_type: string;
    trigger_content: string | null;
    original_content: string | null;
    actions_taken: string[];
    created_at: string;
}

export interface JoinLeaveLog {
    id: string;
    user_id: string;
    guild_id: string;
    action: JoinLeaveAction
    created_at: string;
}

export interface ModerationLog {
    case_id: string;
    guild_id: string;
    target_id?: string;
    moderator_id: string;
    action_type: string;
    reason: string | null;
    duration: string | null;
    created_at: string;
}