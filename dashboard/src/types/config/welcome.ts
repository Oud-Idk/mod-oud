import { DiscordEmbed } from "@/types/embed";

export interface PublicWelcomeConfig {
    enabled: boolean;
    channel_id: string;
    content?: string;
    embed?: DiscordEmbed;
    format: "embed" | "text";
}

export interface PrivateWelcomeConfig {
    enabled: boolean;
    content?: string;
    embed?: DiscordEmbed;
    format: "embed" | "text";
}

export interface VerificationConfig {
    enabled: boolean;
    verification_message_id?: string;
    verification_channel_id?: string;
    verification_role_id?: string;
    content?: string;
    embed?: DiscordEmbed;
    format: "embed" | "text";
}

export interface WelcomeConfig {
    public: PublicWelcomeConfig;
    private: PrivateWelcomeConfig;
    join_role_ids?: string[];
    verification: VerificationConfig;
}