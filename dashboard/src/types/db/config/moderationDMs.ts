import { DiscordEmbed } from "@/types/embed";
import { Format } from "@/types/db";

export interface DMTemplateSetting {
    enabled: boolean;
    content: string;
    embed: DiscordEmbed;
    format: Format;
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
    honeypot: DMTemplateSetting;
}