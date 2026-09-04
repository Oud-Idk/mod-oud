import {
    BuilderConfig,
    COMMON_PLACEHOLDERS,
} from "@/features/_shared/builderConfig";

export const VERIFICATION_CONFIG: BuilderConfig = {
    id: "verification",
    name: "Verification Panel Builder",
    description: "Configure the verification panel new members interact with to gain access.",
    placeholders: [
        ...COMMON_PLACEHOLDERS,

        { key: "random", mockValue: "7", label: "Generates a random number between 0 and 10" },
        {
            key: "random:x:y",
            mockValue: "42",
            label: "Generates a random number between your custom minimum (x) and maximum (y)"
        },
    ],
};
