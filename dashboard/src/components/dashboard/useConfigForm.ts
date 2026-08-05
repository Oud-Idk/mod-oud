import { useCallback, useEffect, useState, useTransition } from "react";
import { isDeepEqual } from "@/features/_shared/embed";

interface UseConfigFormOptions<T> {
    initialConfig: T;
    onSave: (config: T) => Promise<void> | Promise<any>;
}

export function useConfigForm<T>({
    initialConfig,
    onSave,
}: UseConfigFormOptions<T>) {
    const [config, setConfig] = useState<T>(initialConfig);
    const [isPending, startTransition] = useTransition();
    const [resetKey, setResetKey] = useState(0);

    const [isEmpty, setIsEmpty] = useState(false);
    const [targetChannelIsEmpty, setTargetChannelIsEmpty] = useState(false);

    useEffect(() => {
        setConfig(initialConfig);
    }, [initialConfig]);

    const isDirty = !isDeepEqual(config, initialConfig) && !isEmpty && !targetChannelIsEmpty;

    const handleSave = useCallback(() => {
        startTransition(async () => {
            try {
                await onSave(config);
            } catch (error) {
                console.error("Failed to save configuration:", error);
            }
        });
    }, [config, onSave]);

    const handleCancel = useCallback(() => {
        setConfig(initialConfig);
        setResetKey((prev) => prev + 1);
        setIsEmpty(false);
        setTargetChannelIsEmpty(false);
    }, [initialConfig]);

    const handleChange = useCallback((updated: Partial<T> | T) => {
        setConfig((prev) => {
            if (typeof updated === "object" && updated !== null && !Array.isArray(updated)) {
                return { ...prev, ...updated };
            }
            return updated as T;
        });
    }, []);

    return {
        config,
        setConfig,
        isPending,
        isDirty,
        resetKey,
        isEmpty,
        setIsEmpty,
        targetChannelIsEmpty,
        setTargetChannelIsEmpty,
        handleSave,
        handleCancel,
        handleChange,
    };
}