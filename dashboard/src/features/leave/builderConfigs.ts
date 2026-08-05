import {
    BuilderConfig,
    CHANNEL_PLACEHOLDERS,
    COMMON_PLACEHOLDERS,
    MEMBER_PLACEHOLDERS
} from "@/features/_shared/builderConfig";

export const LEAVE_CONFIG: BuilderConfig = {
    id: "leave",
    name: "Leave Message Builder",
    description: "Configure dynamic leave messages for members who left.",
    placeholders: [
        ...COMMON_PLACEHOLDERS,
        ...MEMBER_PLACEHOLDERS,
        ...CHANNEL_PLACEHOLDERS,

        { key: "random", mockValue: "7", label: "Generates a random number between 0 and 10" },
        {
            key: "random:x:y",
            mockValue: "42",
            label: "Generates a random number between your custom minimum (x) and maximum (y)"
        },
    ],
};