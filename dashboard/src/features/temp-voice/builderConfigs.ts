import { BuilderConfig, Placeholder } from "@/features/_shared/builderConfig";

const CHANNEL_NAME_PLACEHOLDERS: Placeholder[] = [
    {
        key: "user.display_name",
        mockValue: "John Doe",
        label: "The user's server nickname, falling back to their global display name",
    },
    {
        key: "user.username",
        mockValue: "johndoe",
        label: "The unique Discord username of the creator",
    },
    {
        key: "user.id",
        mockValue: "123456789012345678",
        label: "The unique Discord Snowflake ID of the user",
    },
    {
        key: "guild.name",
        mockValue: "My Discord Server",
        label: "The name of the Discord server (guild) where the channel is created",
    },
];
export const TEMP_VOICE_CHANNEL_BUILDER_CONFIG: BuilderConfig = {
    description: "",
    id: "",
    name: "",
    placeholders: CHANNEL_NAME_PLACEHOLDERS, // Include placeholders
};