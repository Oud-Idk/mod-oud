import { BuilderConfig, COMMON_PLACEHOLDERS } from "@/features/_shared/builderConfig";

export const LEVEL_NOTIFY_CONFIG: BuilderConfig = {
    id: "levels",
    name: "Level Up Message Builder",
    description: "Configure the messages sent when a user levels up.",
    placeholders: [
        ...COMMON_PLACEHOLDERS,
        { key: "level.current", mockValue: "17", label: "The current level" },
        { key: "level.previous", mockValue: "16", label: "The previous level" },
    ],
};