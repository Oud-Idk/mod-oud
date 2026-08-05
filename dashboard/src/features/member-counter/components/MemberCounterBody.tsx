
import { ForwardRefExoticComponent, ReactNode, SVGProps, useMemo, useState } from "react";
import { Bot, Hash, Loader2, Plus, ShieldAlert, Sparkles, Trash2, UserCheck, Users, Wand2 } from "lucide-react";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { Dropdown } from "@/components/ui/Dropdown";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { CounterChannel, CounterType, MemberCounterConfig } from "@/features/member-counter/types";

import { setupMemberCounterChannelsAction } from "@/features/member-counter/actions";

interface MemberCounterBodyProps {
    guildId: string;
    memberCounterConfig: MemberCounterConfig;
    onSave: (data: MemberCounterConfig) => Promise<void>;
    roleMap: Record<string, string>;
}

const COUNTER_TYPES: {
    label: string;
    value: CounterType;
    icon: ForwardRefExoticComponent<Omit<SVGProps<SVGSVGElement>, "ref">>;
    defaultTemplate: string
}[] = [
    { label: "Total Members", value: "TOTAL_MEMBERS", icon: Users, defaultTemplate: "👥 Members: {count}" },
    { label: "Humans Only", value: "HUMANS_ONLY", icon: UserCheck, defaultTemplate: "👨 Humans: {count}" },
    { label: "Bots Only", value: "BOTS_ONLY", icon: Bot, defaultTemplate: "🤖 Bots: {count}" },
    { label: "Online Members", value: "ONLINE_MEMBERS", icon: Sparkles, defaultTemplate: "🟢 Online: {count}" },
    { label: "Role Count", value: "ROLE_COUNT", icon: ShieldAlert, defaultTemplate: "⭐ VIPs: {count}" },
];

export function MemberCounterBody({
    guildId,
    memberCounterConfig,
    onSave,
    roleMap,
}: MemberCounterBodyProps): ReactNode {
    const normalizedConfig = useMemo(() => memberCounterConfig, [memberCounterConfig]);
    const [isCreatingChannels, setIsCreatingChannels] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    const {
        config,
        setConfig,
        isPending,
        isDirty,
        handleSave,
        handleCancel,
    } = useConfigForm({
        initialConfig: normalizedConfig,
        onSave,
    });

    const roleOptions = useMemo(() => {
        return Object.entries(roleMap).map(([id, name]) => ({
            value: id,
            label: name,
        }));
    }, [roleMap]);

    const handleAddCounter = (): void => {
        const newCounter: CounterChannel = {
            id: crypto.randomUUID(),
            channelId: "",
            counterType: "TOTAL_MEMBERS",
            nameTemplate: "👥 Members: {count}",
        };

        setConfig({
            ...config,
            counters: [...(config.counters || []), newCounter],
        });
    };

    const handleRemoveCounter = (id: string): void => {
        setConfig({
            ...config,
            counters: (config.counters || []).filter((c) => c.id !== id),
        });
    };

    const handleUpdateCounter = <K extends keyof CounterChannel>(
        id: string,
        key: K,
        value: CounterChannel[K]
    ): void => {
        setConfig({
            ...config,
            counters: (config.counters || []).map((c) => {
                if (c.id === id) {
                    const updated = { ...c, [key]: value };
                    if (key === "counterType") {
                        const matched = COUNTER_TYPES.find((t) => t.value === value);
                        if (matched) updated.nameTemplate = matched.defaultTemplate;
                    }
                    return updated;
                }
                return c;
            }),
        });
    };

    // Server action caller: auto-creates category & missing channels
    const handleAutoCreateChannels = async (targetCounterId?: string): Promise<void> => {
        setIsCreatingChannels(true);
        setCreateError(null);

        // Filter target counters or pass all counters to backend
        const countersToProcess = targetCounterId
            ? (config.counters || []).filter((c) => c.id === targetCounterId)
            : (config.counters || []);

        const result = await setupMemberCounterChannelsAction(guildId, countersToProcess);

        setIsCreatingChannels(false);

        if (result.success && result.counters) {
            // Update local state with the newly assigned channel IDs
            const updatedCounters = (config.counters || []).map((c) => {
                const matchedNew = result.counters?.find((nc) => nc.id === c.id);
                return matchedNew ? { ...c, channelId: matchedNew.channelId } : c;
            });

            setConfig({
                ...config,
                counters: updatedCounters,
            });
        } else {
            setCreateError(result.error || "Failed to auto-create Discord channels.");
        }
    };

    const hasMissingChannelIds = config.counters?.some((c) => !c.channelId?.trim());

    return (
        <div className="w-full space-y-6 text-zinc-900 dark:text-zinc-100">
            {/* Header & Master Toggle */}
            <div className="flex items-start justify-between border-b border-zinc-200 dark:border-zinc-800 pb-5">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">Member Counter</h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                        Automatically update locked voice channel names with live server statistics. </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                    <input
                        type="checkbox"
                        checked={config.enabled ?? false}
                        onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                        className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-zinc-200 dark:bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
            </div>

            {config.enabled && (
                <div className="space-y-6">
                    {/* Error Banner */}
                    {createError && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs rounded-lg flex items-center justify-between">
                            <span>{createError}</span>
                            <button onClick={() => setCreateError(null)} className="font-bold ml-2">✕</button>
                        </div>
                    )}

                    {/* Update Frequency Bar */}
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                        <div>
                            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Update Frequency</h3>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                Frequency of channel name updates (Recommended: 15 mins to avoid Discord rate
                                limits). </p>
                        </div>
                        <select
                            value={config.updateIntervalMinutes ?? 15}
                            onChange={(e) => setConfig({ ...config, updateIntervalMinutes: Number(e.target.value) })}
                            className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 text-sm rounded-lg px-3 py-2 text-zinc-900 dark:text-white font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        >
                            <option value={5}>Every 5 minutes</option>
                            <option value={10}>Every 10 minutes</option>
                            <option value={15}>Every 15 minutes (Default)</option>
                            <option value={30}>Every 30 minutes</option>
                        </select>
                    </div>

                    {/* Section Header */}
                    <div className="flex items-center justify-between pt-2">
                        <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Configured Stat
                            Channels</h2>
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-zinc-500">{config.counters?.length || 0} active</span>
                            {hasMissingChannelIds && (
                                <button
                                    onClick={() => handleAutoCreateChannels()}
                                    disabled={isCreatingChannels}
                                    className="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800 transition flex items-center gap-1.5 font-medium disabled:opacity-50"
                                >
                                    {isCreatingChannels ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin"/>
                                    ) : (
                                        <Wand2 className="w-3.5 h-3.5"/>
                                    )}
                                    Auto-Create All Missing </button>
                            )}
                        </div>
                    </div>

                    {/* Counter Cards */}
                    <div className="space-y-4">
                        {config.counters?.map((counter, index) => {
                            const MatchedIcon = COUNTER_TYPES.find((t) => t.value === counter.counterType)?.icon || Hash;
                            const isChannelEmpty = !counter.channelId?.trim();

                            return (
                                <div
                                    key={counter.id || index}
                                    className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm"
                                >
                                    {/* Card Header */}
                                    <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                                        <div className="flex items-center gap-2.5">
                                            <div className="p-1.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-lg">
                                                <MatchedIcon className="w-4 h-4"/>
                                            </div>
                                            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                                                COUNTER #{index + 1}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => handleRemoveCounter(counter.id)}
                                            className="text-zinc-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                                            title="Delete Counter"
                                        >
                                            <Trash2 className="w-4 h-4"/>
                                        </button>
                                    </div>

                                    {/* Inputs Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                                                Metric Type
                                            </label>
                                            <Dropdown
                                                options={COUNTER_TYPES.map((t) => ({
                                                    value: t.value,
                                                    label: t.label,
                                                }))}
                                                value={counter.counterType}
                                                onChange={(val) => handleUpdateCounter(counter.id, "counterType", val)}
                                                placeholder="Select metric..."
                                                className="w-full"
                                            />
                                        </div>

                                        {/* Channel ID */}
                                        <div>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                                                    Voice Channel ID
                                                </label>
                                                {isChannelEmpty && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAutoCreateChannels(counter.id)}
                                                        disabled={isCreatingChannels}
                                                        className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 disabled:opacity-50"
                                                    >
                                                        {isCreatingChannels ? (
                                                            <Loader2 className="w-3 h-3 animate-spin"/>
                                                        ) : (
                                                            <Wand2 className="w-3 h-3"/>
                                                        )}
                                                        Auto-create </button>
                                                )}
                                            </div>
                                            <input
                                                type="text"
                                                placeholder={isChannelEmpty ? "Auto-create or enter ID..." : "123456789012345678"}
                                                value={counter.channelId || ""}
                                                onChange={(e) => handleUpdateCounter(counter.id, "channelId", e.target.value)}
                                                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs rounded-lg p-2.5 text-zinc-900 dark:text-white placeholder-zinc-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                                            />
                                        </div>

                                        {/* Name Format */}
                                        <div>
                                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                                                Name Format (`{"{count}"}`)
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="👥 Members: {count}"
                                                value={counter.nameTemplate || ""}
                                                onChange={(e) => handleUpdateCounter(counter.id, "nameTemplate", e.target.value)}
                                                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs rounded-lg p-2.5 text-zinc-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none font-medium"
                                            />
                                        </div>
                                    </div>

                                    {/* Role ID (Conditional) */}
                                    {counter.counterType === "ROLE_COUNT" && (
                                        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                                                Target Role ID
                                            </label>
                                            <Dropdown
                                                value={counter.roleId ?? ""}
                                                onChange={r => handleUpdateCounter(counter.id, "roleId", r)}
                                                options={roleOptions}
                                            />
                                        </div>
                                    )}

                                    {/* Live Preview Box */}
                                    <div className="bg-zinc-50 dark:bg-zinc-950 rounded-lg p-3 flex items-center justify-between text-xs border border-zinc-200/80 dark:border-zinc-800">
                                        <span className="text-zinc-500 text-[11px] font-medium">Discord Preview:</span>
                                        <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-1 rounded border border-indigo-200 dark:border-indigo-800/40">
                                            🔊 {counter.nameTemplate?.replace("{count}", "1,234") || "👥 Members: 1,234"}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Clean Theme-Adaptive Add Button */}
                        <button
                            onClick={handleAddCounter}
                            className="w-full py-3 border-2 border-dashed border-zinc-300 hover:border-indigo-500 dark:border-zinc-800 dark:hover:border-indigo-500 bg-white hover:bg-zinc-50 dark:bg-zinc-900/50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-400 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
                        >
                            <Plus className="w-4 h-4 text-indigo-600 dark:text-indigo-400"/> Add Another Stat Channel
                        </button>
                    </div>
                </div>
            )}

            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending}
                />
            )}
        </div>
    );
}