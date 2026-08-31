import { Dispatch, SetStateAction, useCallback, useState, useTransition, useEffect } from "react";
import { isDeepEqual } from "@/features/_shared/embed";
import { toast } from "sonner";
import { ZodType } from "zod";

interface UseConfigFormOptions<T> {
    initialConfig: T;
    onSave: (config: T) => Promise<void> | Promise<T>;
    schema?: ZodType<T>;
}

interface UseConfigFormReturn<T> {
    config: T;
    setConfig: Dispatch<SetStateAction<T>>;
    isPending: boolean;
    isDirty: boolean;
    resetKey: number;
    handleSave: () => void;
    handleCancel: () => void;
}

export function useConfigForm<T>({
    initialConfig,
    onSave,
    schema,
}: UseConfigFormOptions<T>): UseConfigFormReturn<T> {
    const [config, setConfig] = useState<T>(initialConfig);
    const [isPending, startTransition] = useTransition();
    const [resetKey, setResetKey] = useState(0);

    useEffect(() => {
        setConfig(initialConfig);
    }, [initialConfig]);

    const isDirty = !isDeepEqual(config, initialConfig);

    const handleSave = useCallback((): void => {
        startTransition(async () => {
            try {
                if (schema) {
                    const result = schema.safeParse(config);
                    if (!result.success) {
                        toast.error(result.error.issues[0].message);
                        return;
                    }
                }
                await onSave(config);
                toast.success("Configuration saved successfully");
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to save configuration");
            }
        });
    }, [config, onSave, schema]);

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