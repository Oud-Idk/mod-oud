import { BuilderConfig, COMMON_PLACEHOLDERS, SERVER_PLACEHOLDERS } from "@/features/_shared/builderConfig";

export const CUSTOM_COMMAND_TEMPLATE_CONFIG: BuilderConfig = {
    id: "custom_commands",
    name: "Custom Command Response Builder",
    description: "Configure dynamic response messages for custom triggers.",
    placeholders: [
        ...COMMON_PLACEHOLDERS,
        ...SERVER_PLACEHOLDERS,

        { key: "random", mockValue: "7", label: "Generates a random number between 0 and 10" },
        { key: "random:1:100", mockValue: "42", label: "Generates a random number between custom min and max" },
    ],
};