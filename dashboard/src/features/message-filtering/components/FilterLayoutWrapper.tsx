import { ReactNode } from "react";
import { FilterLayout } from "@/features/message-filtering/components/FilterLayout";
import { BaseRule } from "@/features/message-filtering/types";

interface FilterLayoutWrapperProps<T extends BaseRule> {
    children?: ReactNode;
    config: T;
    updateConfig: (config: Partial<BaseRule>) => void;
    toggleText: string;
    channelMap?: Record<string, string>;
    roleMap?: Record<string, string>;
}

export function FilterLayoutWrapper<T extends BaseRule>({
    children,
    config,
    updateConfig,
    toggleText,
    channelMap,
    roleMap,
}: FilterLayoutWrapperProps<T>) {
    return (
        <FilterLayout
            enabled={config.enabled}
            onToggle={(checked) => updateConfig({ enabled: checked })}
            toggleText={toggleText}
            actions={config.action || []}
            timeoutDuration={config.timeout_duration_seconds}
            onActionsChange={(actions, timeout) => updateConfig({ action: actions, timeout_duration_seconds: timeout })}
            scope={config.scope}
            onScopeChange={newScope => updateConfig({ scope: newScope })}
            channelMap={channelMap}
            roleMap={roleMap}
        >
            {children}
        </FilterLayout>
    )
}