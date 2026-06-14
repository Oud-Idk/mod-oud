import { DiscordEmbed } from "@/types/embed";

export interface DMTemplateSetting {
    enabled: boolean;
    content: string;
    embed: DiscordEmbed;
    format: "embed" | "text";
}

export interface ModerationDMsConfig {
    warn: DMTemplateSetting;
    pardon_warn: DMTemplateSetting;
    unpardon_warn: DMTemplateSetting;
    unpardon_delete_warn: DMTemplateSetting;
    mute: DMTemplateSetting;
    unmute: DMTemplateSetting;
    kick: DMTemplateSetting;
    ban: DMTemplateSetting;
    softban: DMTemplateSetting;
}