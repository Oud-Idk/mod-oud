export interface PublicWelcomeConfig {
    enabled: boolean;
    channel_id: string;
    content: string;
    embed: string;
    format: "embed" | "text";
}

export interface PrivateWelcomeConfig {
    enabled: boolean;
    content: string;
    embed: string;
    format: "embed" | "text";
}

export interface WelcomeConfig {
    public: PublicWelcomeConfig;
    private: PrivateWelcomeConfig;
    join_role_ids?: string[];
}