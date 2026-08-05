import {
    BuilderConfig,
    COMMON_PLACEHOLDERS,
    MEMBER_PLACEHOLDERS,
    SERVER_PLACEHOLDERS
} from "@/features/_shared/builderConfig";

export const WELCOME_CONFIG: BuilderConfig = {
    id: "welcome",
    name: "Welcome Message Builder",
    description: "Configure dynamic arrival embeds for newly joined members.",
    placeholders: [
        ...COMMON_PLACEHOLDERS,
        ...SERVER_PLACEHOLDERS,

        { key: "random", mockValue: "7", label: "Generates a random number between 0 and 10" },
        {
            key: "random:x:y",
            mockValue: "42",
            label: "Generates a random number between your custom minimum (x) and maximum (y)"
        },
    ],
};