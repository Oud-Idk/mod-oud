import { Format } from "@/types/db";
import { DiscordEmbed } from "@/types/embed";

export type CooldownType = "NONE" | "USER" | "SERVER";

export interface CustomMessagePayload {
    format: Format;
    content?: string;
    embed?: DiscordEmbed;
}

export type CommandAction =
    | {
    type: "send_channel_message";
    data: {
        channel_id: string;
        messages: CustomMessagePayload[];
        randomize: boolean;
    };
}
    | {
    type: "respond_current_channel";
    data: {
        is_dm: boolean;
        is_ephemeral: boolean;
        messages: CustomMessagePayload[];
        randomize: boolean;
    };
}
    | {
    type: "add_role";
    data: {
        role_id: string;
    };
}
    | {
    type: "remove_role";
    data: {
        role_id: string;
    };
};

export interface CustomCommand {
    id: number;
    guild_id: string;
    name: string;
    description?: string;
    enabled: boolean;
    delete_trigger: boolean;
    cooldown_type: CooldownType;
    cooldown_seconds: number;
    allowed_roles: string[];
    ignored_roles: string[];
    allowed_channels: string[];
    ignored_channels: string[];
    actions: CommandAction[];
}