"use client";

import React, { ForwardRefExoticComponent, JSX, SVGProps, useMemo, useState } from "react";
import { Bot, Hash, Loader2, Plus, ShieldAlert, Sparkles, Trash2, UserCheck, Users, Wand2 } from "lucide-react";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { Dropdown, DropdownOption } from "@/components/ui/Dropdown";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { Button } from "@/components/ui/Button";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { CounterChannel, CounterType, MemberCounterConfig, memberCounterConfigSchema } from "@/features/member-counter/types";
import { setupMemberCounterChannelsAction } from "@/features/member-counter/actions";
import { InputLabel } from "@/components/layout/InputLabel";
import Footer from "@/components/layout/Footer";
import Emphasis from "@/components/layout/Emphasis";
import { TextInput } from "@/components/ui/TextInput";
import { toast } from "sonner";

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
    defaultTemplate: string;
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
}: MemberCounterBodyProps): JSX.Element {
    const normalizedConfig = useMemo(() => memberCounterConfig, [memberCounterConfig]);
    const [isCreatingChannels, setIsCreatingChannels] = useState(false);

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
            channelId: null,
            counterType: "TOTAL_MEMBERS",
            roleId: null,
            nameTemplate: "👥 Members: {count}",
        };

        setConfig({
            ...config,
            counters: [...config.counters, newCounter],
        });
    };

    const handleRemoveCounter = (id: string): void => {
        setConfig({
            ...config,
            counters: config.counters.filter((c) => c.id !== id),
        });
    };

    const handleUpdateCounter = <K extends keyof CounterChannel>(
        id: string,
        key: K,
        value: CounterChannel[K]
    ): void => {
        setConfig({
            ...config,
            counters: config.counters.map((c) => {
                if (c.id === id) {
                    const updated = { ...c, [key]: value };
                    if (key === "counterType") {
                        const matched = COUNTER_TYPES.find((t) => t.value === value);
                        if (matched !== undefined) updated.nameTemplate = matched.defaultTemplate;
                    }
                    return updated;
                }
                return c;
            }),
        });
    };

    const handleAutoCreateChannels = async (targetCounterId?: string): Promise<void> => {
        setIsCreatingChannels(true);

        try {
            const countersToProcess = targetCounterId !== undefined
                ? config.counters.filter((c) => c.id === targetCounterId)
                : config.counters;

            const result = await setupMemberCounterChannelsAction(guildId, countersToProcess);

            const updatedCounters = config.counters.map((c) => {
                const matchedNew = result.counters.find((nc) => nc.id === c.id);
                return matchedNew !== undefined ? { ...c, channelId: matchedNew.channelId ?? null } : c;
            });

            setConfig({
                ...config,
                counters: updatedCounters,
            });
            toast.success("Channels created successfully! 🎉");
        } catch (error) {
            console.error("Failed to auto-create channels:", error);
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to create channels. Please check bot permissions!"
            );
        } finally {
            setIsCreatingChannels(false);
        }
    };

    const hasMissingChannelIds = config.counters.some(
        (c) => c.channelId === null || c.channelId.trim().length === 0
    );

    const timeOptions: DropdownOption<"5" | "10" | "15" | "30">[] = [
        { value: "5", label: "Every 5 Minutes" },
        { value: "10", label: "Every 10 Minutes" },
        { value: "15", label: "Every 15 Minutes" },
        { value: "30", label: "Every 30 Minutes" },
    ];

    const onValidatedSave = (): void => {
        const validation = memberCounterConfigSchema.safeParse(config);
        if (!validation.success) {
            toast.error(validation.error.issues[0].message);
            return;
        }
        handleSave();
    };

    return (
        <div className="w-full space-y-6 text-foreground">
            <ToggleSwitch
                checked={config.enabled}
                onChange={(checked) => { setConfig({ ...config, enabled: checked }); }}
                disabled={isPending}
                text="Enable Member Counter"
            />

            {config.enabled && (
                <div className="space-y-2">
                    <div className="max-w-md">
                        <InputLabel>Update Frequency</InputLabel>
                        <Dropdown
                            value={String(config.updateIntervalMinutes)}
                            options={timeOptions}
                            onChange={(v) => {
                                if (v !== null) {
                                    setConfig({ ...config, updateIntervalMinutes: Number(v) });
                                }
                            }}
                        />
                        <Footer className="mt-1">
                            Frequency of channel name updates (Recommended: 15 mins to avoid Discord rate limits).
                        </Footer>
                    </div>

                    {/* Section Header */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Emphasis>Configured Stat Channels</Emphasis>
                            <span className="text-xs text-muted-foreground font-medium">
                                ({config.counters.length} active)
                            </span>
                        </div>
                        {hasMissingChannelIds && (
                            <Button
                                type="button"
                                onClick={() => { void handleAutoCreateChannels(); }}
                                disabled={isCreatingChannels}
                                className="text-xs border border-brand/30 bg-brand-subtle text-brand hover:bg-brand/10 px-3 py-1.5 focus-ring cursor-pointer"
                            >
                                {isCreatingChannels ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5"/>
                                ) : (
                                    <Wand2 className="w-3.5 h-3.5 mr-1.5"/>
                                )}
                                Auto-Create All Missing
                            </Button>
                        )}
                    </div>

                    {/* Counter Cards */}
                    <div className="space-y-4">
                        {config.counters.map((counter, index) => {
                            const MatchedIcon =
                                COUNTER_TYPES.find((t) => t.value === counter.counterType)?.icon ?? Hash;
                            const isChannelEmpty = counter.channelId === null || counter.channelId.trim().length === 0;

                            return (
                                <div
                                    key={counter.id}
                                    className="bg-surface border border-border rounded-xl p-5 space-y-4 shadow-xs"
                                >
                                    {/* Card Header */}
                                    <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                                        <div className="flex items-center gap-2.5">
                                            <div className="p-2 bg-brand-subtle text-brand rounded-lg">
                                                <MatchedIcon className="w-4 h-4"/>
                                            </div>
                                            <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                                                COUNTER #{index + 1}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => { handleRemoveCounter(counter.id); }}
                                            className="text-muted-foreground hover:text-danger p-1.5 rounded-lg hover:bg-surface-active transition cursor-pointer"
                                            title="Delete Counter"
                                        >
                                            <Trash2 className="w-4 h-4"/>
                                        </button>
                                    </div>

                                    {/* Inputs Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="space-y-1.5">
                                            <InputLabel>Metric Type</InputLabel>
                                            <Dropdown
                                                options={COUNTER_TYPES.map((t) => ({
                                                    value: t.value,
                                                    label: t.label,
                                                }))}
                                                value={counter.counterType}
                                                onChange={(val) => {
                                                    if (val !== null) {
                                                        handleUpdateCounter(counter.id, "counterType", val);
                                                    }
                                                }}
                                                placeholder="Select metric..."
                                                className="w-full"
                                            />
                                        </div>

                                        {/* Channel ID */}
                                        <div>
                                            <div className="flex items-center justify-between">
                                                <InputLabel>Voice Channel ID</InputLabel>
                                                {isChannelEmpty && (
                                                    <button
                                                        type="button"
                                                        onClick={() => { void handleAutoCreateChannels(counter.id); }}
                                                        disabled={isCreatingChannels}
                                                        className="text-[11px] font-medium text-brand hover:underline flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                                                    >
                                                        {isCreatingChannels ? (
                                                            <Loader2 className="w-3 h-3 animate-spin"/>
                                                        ) : (
                                                            <Wand2 className="w-3 h-3"/>
                                                        )}
                                                        Auto-create
                                                    </button>
                                                )}
                                            </div>
                                            <TextInput
                                                placeholder={
                                                    isChannelEmpty
                                                        ? "Auto-create or enter ID..."
                                                        : "123456789012345678"
                                                }
                                                value={counter.channelId ?? ""}
                                                onChange={(e) => {
                                                    const trimmed = e.target.value.trim();
                                                    handleUpdateCounter(
                                                        counter.id,
                                                        "channelId",
                                                        trimmed.length > 0 ? trimmed : null
                                                    );
                                                }}
                                            />
                                        </div>

                                        {/* Name Format */}
                                        <div className="space-y-1.5">
                                            <InputLabel>
                                                Name Format (`{"{count}"}`)
                                            </InputLabel>
                                            <TextInput
                                                placeholder="👥 Members: {count}"
                                                value={counter.nameTemplate}
                                                onChange={(e) => {
                                                    handleUpdateCounter(counter.id, "nameTemplate", e.target.value);
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* Role ID (Conditional) */}
                                    {counter.counterType === "ROLE_COUNT" && (
                                        <div className="pt-2 border-t border-border-subtle space-y-1.5">
                                            <InputLabel>Target Role ID</InputLabel>
                                            <Dropdown
                                                value={counter.roleId ?? ""}
                                                onChange={(r) => {
                                                    handleUpdateCounter(
                                                        counter.id,
                                                        "roleId",
                                                        r !== null && r.length > 0 ? r : null
                                                    );
                                                }}
                                                options={roleOptions}
                                            />
                                        </div>
                                    )}

                                    <span className="font-mono text-brand font-bold bg-brand-subtle px-2.5 py-1 text-xs rounded border border-brand/20">
                                        🔊 {counter.nameTemplate.length > 0 ? counter.nameTemplate.replace("{count}", "1,234") : "👥 Members: 1,234"}
                                    </span>
                                </div>
                            );
                        })}

                        {/* Add Button */}
                        <button
                            type="button"
                            onClick={handleAddCounter}
                            className="w-full py-3.5 border-2 border-dashed border-border hover:border-brand bg-surface hover:bg-surface-muted text-muted-foreground hover:text-foreground text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer focus-ring"
                        >
                            <Plus className="w-4 h-4 text-brand"/> Add Another Stat Channel
                        </button>
                    </div>
                </div>
            )}

            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel}
                    handleSave={onValidatedSave}
                    isSaving={isPending}
                />
            )}
        </div>
    );
}