import { DiscordEmbed } from "@/types/embed";
import { CaptchaType, Format } from "@/types/db";

export interface PublicWelcomeConfig {
    enabled: boolean;
    channel_id: string;
    content?: string;
    embed?: DiscordEmbed;
    format: Format;
}

export interface PrivateWelcomeConfig {
    enabled: boolean;
    content?: string;
    embed?: DiscordEmbed;
    format: Format;
}

export interface VerificationConfig {
    enabled: boolean;
    useOauth: boolean;
    captchaType: CaptchaType;
    verificationMessageId?: string;
    verificationChannelId?: string;
    verificationRoleId?: string;
    content?: string;
    embed?: DiscordEmbed;
    format: Format;
}

export interface WelcomeConfig {
    public: PublicWelcomeConfig;
    private: PrivateWelcomeConfig;
    joinRoleIds?: string[];
    verification: VerificationConfig;
}