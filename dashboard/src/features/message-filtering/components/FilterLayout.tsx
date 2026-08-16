import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import ActionsSettings from "@/features/message-filtering/components/General/ActionsSettings";
import ScopeSettings from "@/features/message-filtering/components/General/ScopeSettings";
import { JSX, ReactNode } from "react";
import { BaseRule, RuleAction, Scope } from "@/features/message-filtering/types";

interface FilterLayoutProps {
    enabled: boolean;
    onToggle: (checked: boolean) => void;
    toggleText: string;
    actions: RuleAction[];
    timeoutDuration?: number;
    onActionsChange: (actions: RuleAction[], timeout?: number) => void; // Updated signature
    scope: Scope;
    onScopeChange: (newScope: Scope) => void;
    channelMap?: Record<string, string>;
    roleMap?: Record<string, string>;
    children?: ReactNode;
}

export function FilterLayout({
    enabled,
    onToggle,
    toggleText,
    actions,
    timeoutDuration,
    onActionsChange,
    scope,
    onScopeChange,
    channelMap,
    roleMap,
    children,
}: FilterLayoutProps): JSX.Element {
    return (
        <div>
            <ToggleSwitch
                checked={enabled} onChange={onToggle} disabled={false} text={toggleText} shrink={true}
            />

            {enabled && (
                <div className="space-y-2 max-w-md">
                    {children}

                    <ActionsSettings
                        actions={actions} timeoutDuration={timeoutDuration} onChange={onActionsChange}
                    />

                    <ScopeSettings
                        scope={scope} channelMap={channelMap} roleMap={roleMap} onChange={onScopeChange}
                    />
                </div>
            )}
        </div>
    );
}

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
}: FilterLayoutWrapperProps<T>): JSX.Element {
    return (
        <FilterLayout
            enabled={config.enabled}
            onToggle={(checked) => { updateConfig({ enabled: checked }); }}
            toggleText={toggleText}
            actions={config.action}
            timeoutDuration={config.timeoutDurationSeconds ?? undefined}
            onActionsChange={(actions, timeout) => { updateConfig({ action: actions, timeoutDurationSeconds: timeout }); }}
            scope={config.scope}
            onScopeChange={newScope => { updateConfig({ scope: newScope }); }}
            channelMap={channelMap}
            roleMap={roleMap}
        >
            {children}
        </FilterLayout>
    )
}