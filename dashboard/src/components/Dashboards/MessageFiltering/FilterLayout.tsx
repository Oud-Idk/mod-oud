import { ToggleSwitch } from "@/components/Dashboards/General/ToggleSwitch";
import ActionsSettings from "@/components/Dashboards/MessageFiltering/General/ActionsSettings";
import ScopeSettings from "@/components/Dashboards/MessageFiltering/General/ScopeSettings";
import { RuleAction, Scope } from "@/types/config/messageFiltering"; // Imported RuleAction here
import { ReactNode } from "react";

interface FilterLayoutProps {
    enabled: boolean;
    onToggle: (checked: boolean) => void;
    toggleText: string;
    actions: RuleAction[]; // Updated from string[] to RuleAction[]
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
}: FilterLayoutProps) {
    return (
        <div className="space-y-6">
            <ToggleSwitch
                enabled={enabled} onChange={onToggle} disabled={false} text={toggleText} shrink={true}
            />

            {enabled && (
                <div className="space-y-6">
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