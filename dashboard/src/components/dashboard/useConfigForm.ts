import { useCallback, useState, useTransition } from "react";
import { isDeepEqual } from "@/features/_shared/embed";
import { toast } from "sonner";

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

    const isDirty = !isDeepEqual(config, initialConfig);

    const handleSave = useCallback(async () => {
        startTransition(async () => {
            try {
                await onSave(config);
                toast.success("Configuration saved successfully");
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to save configuration");
            }
        });
    }, [config, onSave]);

    const handleCancel = useCallback(() => {
        setConfig(initialConfig);
        setResetKey((prev) => prev + 1);
    }, [initialConfig]);

    return {
        config,
        setConfig,
        isPending,
        isDirty,
        resetKey,
        handleSave,
        handleCancel,
    };
}