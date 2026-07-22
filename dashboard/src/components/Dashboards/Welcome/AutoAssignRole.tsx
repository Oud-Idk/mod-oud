import { DiscordRole } from "@/components/Dashboards/Welcome/WelcomeBody";
import { JSX, SetStateAction } from "react";


import { WelcomeConfig } from "@/types/db/config/welcome";

interface AutoAssignRoleProps {
    roles: DiscordRole[];
    config: WelcomeConfig;
    isPending: boolean;
    setConfig: (value: SetStateAction<WelcomeConfig>) => void;
}

export function AutoAssignRole({
    roles,
    config,
    setConfig,
    isPending
}: AutoAssignRoleProps): JSX.Element {
    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-lg font-medium text-zinc-100">Auto Assign Roles</h3>
                <p className="text-sm text-zinc-400">
                    Select the roles that will be automatically assigned to new members when they join the
                    server. </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-1 max-h-160 overflow-y-auto border border-zinc-800 rounded-lg p-2 px-4 bg-zinc-900/50">
                {roles.length === 0 ? (
                    <p className="text-sm text-zinc-500">No assignable roles found.</p>
                ) : (
                    roles.map((role) => {
                        const isSelected = config.joinRoleIds?.includes(role.id) ?? false;
                        const roleColorHex = role.color ? `#${role.color.toString(16).padStart(6, "0")}` : undefined;

                        return (
                            <label
                                key={role.id}
                                className="flex items-center space-x-3 p-1 rounded-md cursor-pointer hover:bg-zinc-850 border border-transparent hover:border-zinc-800 transition"
                            >
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    disabled={isPending}
                                    onChange={(e) => {
                                        const checked = e.target.checked;
                                        setConfig((prev) => {
                                            const currentIds = prev.joinRoleIds || [];
                                            const nextIds = checked
                                                ? [...currentIds, role.id]
                                                : currentIds.filter((id) => id !== role.id);
                                            return {
                                                ...prev,
                                                joinRoleIds: nextIds,
                                            };
                                        });
                                    }}
                                    className="rounded border-zinc-700 text-indigo-600 focus:ring-indigo-500 bg-zinc-800 w-4 h-4 cursor-pointer"
                                />
                                <span
                                    className="text-sm font-medium" style={{ color: roleColorHex || "inherit" }}
                                >
                                    {role.name}
                                </span>
                            </label>
                        );
                    })
                )}
            </div>
        </div>
    )
}