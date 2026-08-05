import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import ActionsSettings from "@/features/message-filtering/components/General/ActionsSettings";
import ScopeSettings from "@/features/message-filtering/components/General/ScopeSettings";
import { ReactNode } from "react";
import { Pad } from "@/components/layout/Pad";
import { RuleAction, Scope } from "@/features/message-filtering/types";

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
}: FilterLayoutProps) {
    return (
        <div className="space-y-0">
            <ToggleSwitch
                checked={enabled} onChange={onToggle} disabled={false} text={toggleText} shrink={true}
            />

            {enabled && (
                <div className="space-y-1">
                    {children}

                    <ActionsSettings
                        actions={actions} timeoutDuration={timeoutDuration} onChange={onActionsChange}
                    />
                    <Pad amount={1}/>

                    <ScopeSettings
                        scope={scope} channelMap={channelMap} roleMap={roleMap} onChange={onScopeChange}
                    />
                </div>
            )}
        </div>
    );
}