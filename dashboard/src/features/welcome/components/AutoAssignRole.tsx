import { DiscordRole } from "@/features/welcome/components/WelcomeBody";
import { JSX, SetStateAction } from "react";
import { WelcomeConfig } from "@/features/welcome/types";

interface AutoAssignRoleProps {
    roles: DiscordRole[];
    config: WelcomeConfig;
    isPending: boolean;
    setConfig: (value: SetStateAction<WelcomeConfig>) => void;
}

interface RoleOptionProps {
    role: DiscordRole;
    isSelected: boolean;
    isPending: boolean;
    onToggle: (roleId: string, checked: boolean) => void;
}

function RoleOption({ role, isSelected, isPending, onToggle }: RoleOptionProps) {
    const roleColorHex = role.color
        ? `#${role.color.toString(16).padStart(6, "0")}`
        : "var(--muted-foreground)";

    const containerClasses = [
        "group relative flex items-center justify-between gap-3 p-2.5 px-3 rounded-lg border text-sm font-medium transition-all duration-150 select-none",
        isPending ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        isSelected
            ? "bg-brand-subtle/60 border-brand text-foreground shadow-xs"
            : "bg-surface border-border-subtle text-foreground hover:bg-surface-active hover:border-border",
    ].join(" ");

    const checkboxClasses = [
        "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all",
        isSelected
            ? "bg-brand border-brand text-brand-foreground"
            : "border-border bg-surface group-hover:border-muted-foreground",
    ].join(" ");

    return (
        <label className={containerClasses}>
            {/* Discord Role Color Dot + Name */}
            <div className="flex items-center gap-2.5 min-w-0">
                <span
                    className="w-3 h-3 rounded-full shrink-0 ring-1 ring-black/10 dark:ring-white/10"
                    style={{ backgroundColor: roleColorHex }}
                />
                <span className="truncate">{role.name}</span>
            </div>

            {/* Hidden Input */}
            <input
                type="checkbox"
                checked={isSelected}
                disabled={isPending}
                onChange={(e) => onToggle(role.id, e.target.checked)}
                className="sr-only"
            />

            {/* Custom Visual Checkbox */}
            <div className={checkboxClasses}>
                {isSelected && (
                    <svg className="w-3 h-3 stroke-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                )}
            </div>
        </label>
    );
}

export function AutoAssignRole({
    roles,
    config,
    setConfig,
    isPending,
}: AutoAssignRoleProps): JSX.Element {
    const selectedRolesSet = new Set(config.joinRoleIds || []);

    const handleRoleToggle = (roleId: string, checked: boolean) => {
        if (isPending) return;

        setConfig((prev) => {
            const current = prev.joinRoleIds || [];
            return {
                ...prev,
                joinRoleIds: checked ? [...current, roleId] : current.filter((id) => id !== roleId),
            };
        });
    };

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-lg font-semibold text-foreground tracking-tight">
                    Auto Assign Roles
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                    Select the roles that will be automatically assigned to new members when they join the server.
                </p>
            </div>

            <div className="bg-surface-muted/50 border border-border rounded-xl p-3.5 max-h-80 overflow-y-auto">
                {roles.length === 0 ? (
                    <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                        No assignable roles found.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {roles.map((role) => (
                            <RoleOption
                                key={role.id}
                                role={role}
                                isSelected={selectedRolesSet.has(role.id)}
                                isPending={isPending}
                                onToggle={handleRoleToggle}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}