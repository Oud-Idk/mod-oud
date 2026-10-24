"use client";

import { ReactNode, useCallback, useMemo } from "react";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { ToggleSwitch } from "@/components/ui/inputs/ToggleSwitch";
import { Dropdown } from "@/components/ui/inputs/Dropdown";
import { NumberInput } from "@/components/ui/inputs/NumberInput";
import { InputLabel } from "@/components/layout/InputLabel";
import { AlertTriangle, Gauge } from "lucide-react";
import { toast } from "sonner";

import {
    SLOWMODE_LADDER,
    saveDynamicSlowmodeConfigSchema,
    type DynamicSlowmodeConfig,
    type SlowmodeStatus,
} from "@/features/dynamic-slowmode/types";

interface DynamicSlowmodeBodyProps {
    config: DynamicSlowmodeConfig;
    status: SlowmodeStatus;
    channelMap: Record<string, string>;
    onSave: (config: DynamicSlowmodeConfig) => Promise<void>;
}

type ThresholdField = "authorThresholds" | "volumeThresholds";

function ThresholdInput({
    field,
    index,
    value,
    className,
    onChange,
}: {
    field: ThresholdField;
    index: number;
    value: number;
    className: string;
    onChange: (field: ThresholdField, index: number, value: number) => void;
}): ReactNode {
    return (
        <td className={className}>
            <NumberInput
                min={1}
                value={value}
                onChange={(val) => {
                    onChange(field, index, Math.max(1, val ?? 1));
                }}
            />
        </td>
    );
}

export function DynamicSlowmodeBody({
    config,
    status,
    channelMap,
    onSave,
}: DynamicSlowmodeBodyProps): ReactNode {
    const initial = useMemo(() => config, [config]);

    const { config: draft, setConfig, isPending, isDirty, handleSave, handleCancel } =
        useConfigForm<DynamicSlowmodeConfig>({ initialConfig: initial, onSave });

    const handleChange = useCallback(
        (updated: Partial<DynamicSlowmodeConfig>) => {
            setConfig((prev) => ({ ...prev, ...updated }));
        },
        [setConfig]
    );

    const channelOptions = useMemo(
        () =>
            Object.entries(channelMap)
                .map(([id, name]) => ({ value: id, label: `#${name}` }))
                .sort((a, b) => a.label.localeCompare(b.label)),
        [channelMap]
    );

    const ceilingOptions = useMemo(
        () =>
            SLOWMODE_LADDER.filter((secs) => secs > 0).map((secs) => ({
                value: String(secs),
                label: `${String(secs)} seconds`,
            })),
        []
    );

    const windowOptions = [
        { value: "30", label: "30 seconds" },
        { value: "60", label: "1 minute (recommended)" },
        { value: "120", label: "2 minutes" },
        { value: "300", label: "5 minutes" },
    ];

    const toggleChannel = useCallback(
        (channelId: string, selected: boolean) => {
            setConfig((prev) => ({
                ...prev,
                channels: selected
                    ? [...prev.channels, channelId]
                    : prev.channels.filter((id) => id !== channelId),
            }));
        },
        [setConfig]
    );

    const setThreshold = useCallback(
        (field: ThresholdField, index: number, value: number) => {
            setConfig((prev) => {
                const next = [...prev[field]];
                next[index] = value;
                return { ...prev, [field]: next };
            });
        },
        [setConfig]
    );

    const onValidatedSave = (): void => {
        const validation = saveDynamicSlowmodeConfigSchema.safeParse(draft);
        if (!validation.success) {
            toast.error(validation.error.issues[0].message);
            return;
        }
        handleSave();
    };

    const isAtCeiling = (secs: number): boolean => secs > 0 && secs === draft.ceilingSecs;

    return (
        <div className="space-y-6">
            <ToggleSwitch
                checked={draft.enabled}
                onChange={(checked) => {
                    handleChange({ enabled: checked });
                }}
                text="Enable Dynamic Slowmode"
            />

            {draft.enabled && (
                <div className="space-y-6 mt-2">
                    <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
                        <div className="flex items-center gap-2.5">
                            <Gauge className="w-5 h-5 text-muted-foreground" />
                            <span className="font-semibold text-sm text-foreground">
                                Live Channels
                            </span>
                        </div>

                        {status.channels.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                                No channel is being automated yet. Add one below and the bot will
                                start measuring it on its next pass.
                            </p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {status.channels.map((row) => (
                                    <div
                                        key={row.channelId}
                                        className="p-3 bg-surface-muted border border-border rounded-lg space-y-1"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-medium text-foreground truncate">
                                                #{channelMap[row.channelId] ?? row.channelId}
                                            </span>
                                            <span className="text-lg font-bold font-mono text-foreground">
                                                {row.lastWrittenSecs}s
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                                            <span>
                                                {row.authors} authors / {row.volume} msgs
                                            </span>
                                            <span
                                                className={
                                                    row.armed ? "text-success" : "text-warning"
                                                }
                                            >
                                                {row.status}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-2">
                            <InputLabel>Ceiling</InputLabel>
                            <Dropdown
                                options={ceilingOptions}
                                value={String(draft.ceilingSecs)}
                                onChange={(val) => {
                                    handleChange({ ceilingSecs: Number(val) });
                                }}
                            />
                            <p className="text-xs text-muted-foreground">
                                The highest slowmode the bot will ever set. Discord allows up to six
                                hours, but anything past a few minutes silences a channel.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <InputLabel>Measurement Window</InputLabel>
                            <Dropdown
                                options={windowOptions}
                                value={String(draft.windowSecs)}
                                onChange={(val) => {
                                    handleChange({ windowSecs: Number(val) });
                                }}
                            />
                            <p className="text-xs text-muted-foreground">
                                How far back the bot counts messages and distinct authors.
                            </p>
                        </div>
                    </div>

                    <div className="p-5 bg-surface border border-border rounded-xl space-y-3">
                        <div>
                            <span className="font-semibold text-sm text-foreground">
                                Tracked Channels
                            </span>
                            <p className="text-xs text-muted-foreground mt-1">
                                Only these channels are ever edited. Categories, announcements,
                                threads and forums cannot take slowmode, so they are not listed.
                            </p>
                        </div>

                        {channelOptions.length === 0 ? (
                            <p className="text-xs text-warning">
                                No eligible channels were found for this server.
                            </p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {channelOptions.map((option) => (
                                    <label
                                        key={option.value}
                                        className="flex items-center gap-2 p-2 rounded-lg border border-border bg-surface-muted cursor-pointer hover:bg-surface"
                                    >
                                        <input
                                            type="checkbox"
                                            className="accent-primary"
                                            checked={draft.channels.includes(option.value)}
                                            onChange={(event) => {
                                                toggleChannel(option.value, event.target.checked);
                                            }}
                                        />
                                        <span className="text-sm text-foreground truncate">
                                            {option.label}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
                        <div>
                            <span className="font-semibold text-sm text-foreground">
                                Ladder Thresholds
                            </span>
                            <p className="text-xs text-muted-foreground mt-1">
                                Authors is the primary signal. Volume can only push the target
                                higher, never hold it back, so a flood from a few people still
                                escalates. Rung 0 means the channel&apos;s traffic is below the
                                first threshold.
                            </p>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs text-muted-foreground">
                                        <th className="py-1 pr-4 font-medium">Slowmode</th>
                                        <th className="py-1 pr-4 font-medium">Distinct authors</th>
                                        <th className="py-1 font-medium">Messages</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {SLOWMODE_LADDER.map((secs, index) => (
                                        <tr key={secs} className="border-t border-border">
                                            <td className="py-2 pr-4 font-mono">
                                                {secs}s
                                                {isAtCeiling(secs) && (
                                                    <span className="ml-2 text-xs text-warning">
                                                        ceiling
                                                    </span>
                                                )}
                                            </td>
                                            {index === 0 ? (
                                                <td
                                                    colSpan={2}
                                                    className="py-2 text-xs text-muted-foreground"
                                                >
                                                    Below the first threshold
                                                </td>
                                            ) : (
                                                <>
                                                    <ThresholdInput
                                                        field="authorThresholds"
                                                        index={index - 1}
                                                        value={draft.authorThresholds[index - 1]}
                                                        className="py-2 pr-4"
                                                        onChange={setThreshold}
                                                    />
                                                    <ThresholdInput
                                                        field="volumeThresholds"
                                                        index={index - 1}
                                                        value={draft.volumeThresholds[index - 1]}
                                                        className="py-2"
                                                        onChange={setThreshold}
                                                    />
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="p-4 bg-warning-subtle border border-warning/30 rounded-xl flex items-start gap-3 text-warning">
                        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                        <div className="text-xs space-y-1">
                            <p>
                                The bot edits a channel at most once every five minutes. Discord
                                does not document its channel-edit limit, so climbing the ladder
                                takes time on purpose.
                            </p>
                            <p>
                                If a moderator changes a channel&apos;s slowmode by hand, the bot
                                stops automating that channel and leaves the moderator&apos;s value
                                alone. Use <code>/slowmode rearm</code> to resume.
                            </p>
                        </div>
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
