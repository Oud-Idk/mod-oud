"use client";

import React, { JSX } from "react";
import { Hash, ImageIcon, Link2, Trash2, Video } from "lucide-react";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { TextInput } from "@/components/ui/TextInput";
import { NumberInput } from "@/components/ui/NumberInput";
import { Dropdown } from "@/components/ui/Dropdown";
import { InputLabel } from "@/components/layout/InputLabel";
import Footer from "@/components/layout/Footer";
import { getAvailableRoleOptions } from "@/features/_shared/dropdown";
import { MediaOnlyChannel } from "@/features/media-only/types";
import { PlaceholderList } from "@/features/_shared/message-creator/components/PlaceholderList";

interface MediaOnlyChannelEditorProps {
    channel: MediaOnlyChannel;
    textChannelMap: Record<string, string>;
    roleMap: Record<string, string>;
    isPending: boolean;
    onChange: (patch: Partial<MediaOnlyChannel>) => void;
    onRemove: () => void;
}

export function MediaOnlyChannelEditor({
    channel,
    textChannelMap,
    roleMap,
    isPending,
    onChange,
    onRemove,
}: MediaOnlyChannelEditorProps): JSX.Element {
    const roleOptions = getAvailableRoleOptions(roleMap);

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3 gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-2 bg-brand-subtle text-brand rounded-lg shrink-0">
                        <Hash className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-semibold text-foreground truncate">
                            #{textChannelMap[channel.channelId]}
                        </h3>
                        <p className="text-xs text-muted-foreground truncate">{channel.channelId}</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onRemove}
                    disabled={isPending}
                    className="text-muted-foreground hover:text-danger p-1.5 rounded-lg hover:bg-surface-active transition cursor-pointer disabled:opacity-50"
                    title="Remove Channel"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>

            <ToggleSwitch
                checked={channel.enabled}
                onChange={(v) => { onChange({ enabled: v }); }}
                text="Enforce Media-Only Rules"
                disabled={isPending}
            />

            <div className="space-y-2">
                <InputLabel>Allowed Content</InputLabel>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-muted-foreground" />
                        <ToggleSwitch
                            checked={channel.allowImages}
                            onChange={(v) => { onChange({ allowImages: v }); }}
                            text="Images"
                            shrink
                            disabled={isPending}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Video className="w-4 h-4 text-muted-foreground" />
                        <ToggleSwitch
                            checked={channel.allowVideos}
                            onChange={(v) => { onChange({ allowVideos: v }); }}
                            text="Videos"
                            shrink
                            disabled={isPending}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Video className="w-4 h-4 text-muted-foreground" />
                        <ToggleSwitch
                            checked={channel.allowAudio}
                            onChange={(v) => { onChange({ allowAudio: v }); }}
                            text="Audio"
                            shrink
                            disabled={isPending}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-muted-foreground" />
                        <ToggleSwitch
                            checked={channel.allowGif}
                            onChange={(v) => { onChange({ allowGif: v }); }}
                            text="GIFs"
                            shrink
                            disabled={isPending}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Link2 className="w-4 h-4 text-muted-foreground" />
                        <ToggleSwitch
                            checked={channel.allowLinks}
                            onChange={(v) => { onChange({ allowLinks: v }); }}
                            text="Links (e.g. YouTube embeds)"
                            shrink
                            disabled={isPending}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Hash className="w-4 h-4 text-muted-foreground" />
                        <ToggleSwitch
                            checked={channel.allowEmbeddedText}
                            onChange={(v) => { onChange({ allowEmbeddedText: v }); }}
                            text="Embedded Text"
                            shrink
                            disabled={isPending}
                        />
                    </div>
                </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-border-subtle">
                <ToggleSwitch
                    checked={channel.autoThread}
                    onChange={(v) => { onChange({ autoThread: v }); }}
                    text="Auto-create Threads"
                    disabled={isPending}
                />
                {channel.autoThread && (
                    <div className="space-y-1.5">
                        <InputLabel>Thread Name Template</InputLabel>
                        <TextInput
                            value={channel.threadNameTemplate ?? ""}
                            onChange={(e) =>{ 
                                onChange({ threadNameTemplate: e.target.value }); }
                            }
                            placeholder="Discussion - {user}"
                            disabled={isPending}
                        />
                        <PlaceholderList config={{placeholders: [
                                {
                                    key: "user",
                                    label: "Username of the author",
                                },
                                {
                                    key: "timestamp",
                                    label: "Timestamp in ISO 8602",
                                }
                            ]}}/>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-border-subtle">
                <div className="space-y-1.5">
                    <InputLabel>Auto-Delete Warning After (Seconds)</InputLabel>
                    <NumberInput
                        value={channel.deleteWarningAfterSecs}
                        onChange={(v) => { onChange({ deleteWarningAfterSecs: v ?? 5 }); }}
                        min={0}
                        max={120}
                        clamp
                        disabled={isPending}
                    />
                    <Footer>Set to 0 to keep the warning message.</Footer>
                </div>

                <div className="space-y-1.5">
                    <InputLabel>Exempt Roles</InputLabel>
                    <Dropdown
                        multiple
                        value={channel.exemptRoles}
                        onChange={(roles) => { onChange({ exemptRoles: roles }); }}
                        options={roleOptions}
                        placeholder="Roles Exempt from Rules"
                    />
                </div>
            </div>
        </div>
    );
}
