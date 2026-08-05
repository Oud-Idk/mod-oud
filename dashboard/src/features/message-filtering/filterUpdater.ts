import { MessageFilteringConfig } from "@/features/message-filtering/types";

export function createFilterUpdater<K extends keyof MessageFilteringConfig>(
    config: MessageFilteringConfig,
    handleChange: (data: MessageFilteringConfig) => void,
    key: K
) {
    return (fields: Partial<MessageFilteringConfig[K]>) => {
        handleChange({
            ...config,
            [key]: {
                ...config[key],
                ...fields,
            },
        });
    };
}