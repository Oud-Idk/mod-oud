import { useCallback, useEffect, useState, useTransition } from "react";
import { isDeepEqual } from "@/utils/embed";

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

    // Validation helpers used by various forms
    const [isEmpty, setIsEmpty] = useState(false);
    const [targetChannelIsEmpty, setTargetChannelIsEmpty] = useState(false);

    // Keep draft state in sync if initial prop changes
    useEffect(() => {
        setConfig(initialConfig);
    }, [initialConfig]);

    // Check if form is dirty and not blocked by validation flags
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

    // General state modifier that supports partial or complete updates
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