"use client";

import React, { JSX } from "react";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { InputLabel } from "@/components/layout/InputLabel";
import { TextInput } from "@/components/ui/inputs/TextInput";
import {
    CustomPrefixConfig as CustomPrefixConfigType,
    customPrefixSchema,
} from "@/features/custom-commands/types";

interface CustomPrefixConfigProps {
    initialConfig: CustomPrefixConfigType;
    onSave: (config: CustomPrefixConfigType) => Promise<void>;
}

export function CustomPrefixConfig({ initialConfig, onSave }: CustomPrefixConfigProps): JSX.Element {
    const { config, setConfig, isPending, isDirty, handleSave, handleCancel } = useConfigForm({
        initialConfig,
        onSave,
        schema: customPrefixSchema,
    });

    return (
        <div className="max-w-4xl rounded-md border border-border bg-surface p-4">
            <div>
                <InputLabel>Command Prefix</InputLabel>
                <TextInput
                    value={config.prefix}
                    maxLength={3}
                    onChange={(e) => {
                        setConfig((prev) => ({ ...prev, prefix: e.target.value }));
                    }}
                    placeholder="!"
                    className="w-24 text-center font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">
                    1–3 symbols, no letters, numbers, spaces, or &lt; &gt; @ # ` /.
                    Applies to custom commands and prefix commands. You can always
                    mention the bot instead.
                </p>
            </div>

            {isDirty && (
                <SavePopup handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending} />
            )}
        </div>
    );
}
