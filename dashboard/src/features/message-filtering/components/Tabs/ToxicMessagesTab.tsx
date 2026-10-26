import { JSX } from "react";
import { MessageFilteringConfig, ToxicityCategoryKey } from "@/features/message-filtering/types";
import { createFilterUpdater } from "@/features/message-filtering/filterUpdater";
import { FilterLayoutWrapper } from "@/features/message-filtering/components/FilterLayout";
import { PercentSlider } from "@/components/ui/inputs/PercentSlider";
import { ToggleSwitch } from "@/components/ui/inputs/ToggleSwitch";
import Link from "next/link";

interface ToxicMessagesTabProps {
    config: MessageFilteringConfig;
    handleChange: (data: MessageFilteringConfig) => void;
    channelMap?: Record<string, string>;
    roleMap?: Record<string, string>;
}

interface CategoryMeta {
    key: ToxicityCategoryKey;
    label: string;
    description: string;
    defaultThreshold: number;
}

const CATEGORIES: CategoryMeta[] = [
    {
        key: "toxicity",
        label: "Toxicity",
        description: "Rude, disrespectful, or unreasonable content.",
        defaultThreshold: 0.9,
    },
    {
        key: "severeToxicity",
        label: "Severe Toxicity",
        description: "Very hateful, aggressive, or violent content.",
        defaultThreshold: 0.5,
    },
    {
        key: "obscene",
        label: "Obscene",
        description: "Profanity and vulgar language.",
        defaultThreshold: 0.85,
    },
    {
        key: "identityAttack",
        label: "Identity Attack",
        description: "Hostility or hate towards a protected group.",
        defaultThreshold: 0.7,
    },
    {
        key: "insult",
        label: "Insult",
        description: "Insulting, inflammatory, or negative comments towards a person.",
        defaultThreshold: 0.8,
    },
    {
        key: "threat",
        label: "Threat",
        description: "Statements that intend to inflict pain, injury, or violence.",
        defaultThreshold: 0.6,
    },
    {
        key: "sexualExplicit",
        label: "Sexual Explicit",
        description: "Explicit sexual content or references.",
        defaultThreshold: 0.85,
    },
];

export function ToxicMessagesTab({
    config,
    handleChange,
    channelMap,
    roleMap,
}: ToxicMessagesTabProps): JSX.Element {
    const filterConfig = config.toxicMessageClassifier;
    const updateFilter = createFilterUpdater(config, handleChange, "toxicMessageClassifier");

    const setThreshold = (key: ToxicityCategoryKey, value: number | null): void => {
        updateFilter({ thresholds: { ...filterConfig.thresholds, [key]: value } });
    };

    return (
        <FilterLayoutWrapper
            config={filterConfig}
            updateConfig={updateFilter}
            roleMap={roleMap}
            channelMap={channelMap}
            toggleText="Enable Toxic Messages Classifier"
        >
            <p>
                Machine learning toxicity scores for each message. Enabling this feature
                but doing no actions will default to logging only. Model courtesy of&nbsp;
                <Link className="text-blue-500 hover:underline"
                      href="https://huggingface.co/onnx-community/unbiased-toxic-roberta-ONNX">
                    onnx-community/unbiased-toxic-roberta-ONNX</Link>
            </p>

            <div className="space-y-5">
                {CATEGORIES.map(({ key, label, description, defaultThreshold }) => {
                    const threshold = filterConfig.thresholds[key] ?? null;

                    return (
                        <div key={key} className="space-y-2">
                            <ToggleSwitch
                                checked={threshold !== null}
                                onChange={(checked) => {
                                    setThreshold(key, checked ? defaultThreshold : null);
                                }}
                                text={label}
                                shrink
                            />
                            <p className="text-xs text-muted-foreground">{description}</p>

                            {threshold !== null && (
                                <PercentSlider
                                    value={threshold}
                                    onChange={(value) => { setThreshold(key, value); }}
                                    label="Threshold"
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        </FilterLayoutWrapper>
    );
}