"use client";

import React, { JSX, SetStateAction, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { Dropdown } from "@/components/ui/Dropdown";
import { MultiSelectViewer } from "@/components/ui/MultiSelectViewer";
import { StarboardMessage } from "@/features/starboard/components/StarboardMessage";
import { PlaceholderList } from "@/features/_shared/message-creator/components/PlaceholderList";
import { PlaintextEditor } from "@/features/_shared/message-creator/components/PlaintextEditor";
import { Tabs, TabItem } from "@/components/layout/Tabs";
import EmbedBuilder, { convertToEmbedState } from "@/features/_shared/message-creator/components/EmbedBuilder";
import { InputLabel } from "@/components/layout/InputLabel";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { NumberInput } from "@/components/ui/NumberInput";
import Emphasis from "@/components/layout/Emphasis";
import Footer from "@/components/layout/Footer";
import { toast } from "sonner";

import { getAvailableChannelOptions, getAvailableRoleOptions } from "@/features/_shared/dropdown";
import { STARBOARD_CONFIG } from "@/features/starboard/builderConfigs";
import { starboardConfigInputSchema, type StarboardConfigInput } from "../types";

interface StarboardConfigProps {
    config: StarboardConfigInput;
    channelMap: Record<string, string>;
    roleMap?: Record<string, string>;
    isPending: boolean;
    onDelete: (id: string) => Promise<void>;
    onChange: (updated: StarboardConfigInput) => void;
    setIsEmpty: (isEmpty: SetStateAction<boolean>) => void;
    isEmpty: boolean;
    guildId: string;
}

type TabValue = "general" | "template" | "restrictions";

export function StarboardConfigEditor({
    config,
    channelMap,
    roleMap = {},
    isPending,
    onDelete,
    onChange,
    setIsEmpty,
    guildId,
}: StarboardConfigProps): JSX.Element {
    const router = useRouter();

    const [activeTab, setActiveTab] = useState<TabValue>("general");
    const [roleDropdownValue, setRoleDropdownValue] = useState("");
    const [channelDropdownValue, setChannelDropdownValue] = useState("");
    const [emojiInput, setEmojiInput] = useState("");

    const validationResult = useMemo(() => {
        return starboardConfigInputSchema.safeParse(config);
    }, [config]);

    const hasValidationErrors = !validationResult.success;

    const tabs: TabItem<TabValue>[] = [
        { value: "general", label: "General" },
        { value: "template", label: "Message Template" },
        { value: "restrictions", label: "Restrictions" },
    ];

    const toggleRoleSelection = (roleId: string): void => {
        const current = config.restricted_roles ?? [];
        const updated = current.includes(roleId)
            ? current.filter((id) => id !== roleId)
            : [...current, roleId];
        onChange({ ...config, restricted_roles: updated });
    };

    const toggleChannelSelection = (chanId: string): void => {
        const current = config.restricted_channels ?? [];
        const updated = current.includes(chanId)
            ? current.filter((id) => id !== chanId)
            : [...current, chanId];
        onChange({ ...config, restricted_channels: updated });
    };

    const handleAddEmoji = (e: React.SubmitEvent): void => {
        e.preventDefault();
        const trimmed = emojiInput.trim();
        if (trimmed === "") return;

        const current = config.emojis ?? [];
        if (!current.includes(trimmed)) {
            onChange({ ...config, emojis: [...current, trimmed] });
        }
        setEmojiInput("");
    };

    const handleRemoveEmoji = (emoji: string): void => {
        const current = config.emojis ?? [];
        onChange({ ...config, emojis: current.filter((em) => em !== emoji) });
    };

    const handleDelete = (id: string): void => {
        onDelete(id)
            .then(() => {
                toast.success("Starboard deleted successfully");
                router.push(`/dashboard/${guildId}/starboard`);
            })
            .catch((err: unknown) => {
                toast.error(err instanceof Error ? err.message : "Failed to delete configuration.");
            });
    };

    const id = config.id;

    return (
        <div className="space-y-2">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-bold text-foreground">
                        #{config.starboard_channel_id != null
                        ? (channelMap[config.starboard_channel_id] ?? "starboard")
                        : "Starboard Configuration"}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Customize how and where starred messages are posted.
                    </p>
                </div>

                {id !== undefined && (
                    <Button
                        variant="danger"
                        disabled={isPending}
                        onClick={() => { handleDelete(id); }}
                    >
                        Delete Starboard
                    </Button>
                )}
            </div>

            {hasValidationErrors && (
                <div className="p-3 rounded-lg border border-warning/30 bg-warning-subtle text-warning-foreground text-xs font-medium flex items-center gap-2">
                    <span>⚠️</span>
                    <span>
                        {validationResult.error.issues[0].message}
                    </span>
                </div>
            )}

            <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

            <div className="space-y-6 pt-2">
                {activeTab === "general" && (
                    <div className="space-y-4 max-w-3xl">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <InputLabel required>Destination Channel</InputLabel>
                                <Dropdown
                                    options={getAvailableChannelOptions(channelMap)}
                                    value={config.starboard_channel_id ?? ""}
                                    onChange={(val) => { onChange({ ...config, starboard_channel_id: val }); }}
                                    placeholder="Select channel..."
                                />
                                <p className="text-xs text-muted-foreground">
                                    The channel where starboard messages will be sent.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <InputLabel required>Required Stars</InputLabel>
                                <NumberInput
                                    min={1}
                                    value={config.reaction_threshold ?? 3}
                                    onChange={(v) =>{ 
                                        onChange({
                                            ...config,
                                            reaction_threshold: v ?? 1,
                                        }); }
                                    }
                                />
                                <p className="text-xs text-muted-foreground">
                                    Minimum reaction count required to showcase a message.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4 p-4 rounded-lg border border-border-subtle">
                            <InputLabel>Emojis</InputLabel>
                            <MultiSelectViewer
                                selectedList={config.emojis ?? []}
                                onDelete={(em) => { handleRemoveEmoji(em); }}
                                placeholder="⭐"
                                className="mt-1"
                            />
                            <form onSubmit={handleAddEmoji} className="flex gap-2 max-w-sm mt-2">
                                <TextInput
                                    type="text"
                                    placeholder="Add emoji (e.g. ⭐)"
                                    value={emojiInput}
                                    onChange={(e) => { setEmojiInput(e.target.value); }}
                                />
                                <Button type="submit">Add</Button>
                            </form>
                        </div>

                        <div className="space-y-2 p-4 rounded-lg border border-border-subtle flex flex-col">
                            <ToggleSwitch
                                checked={config.prevent_self_star ?? false}
                                onChange={(checked) => { onChange({ ...config, prevent_self_star: checked }); }}
                                disabled={false}
                                text="Prevent Self-Starring"
                            />
                            <ToggleSwitch
                                checked={config.allow_bot_messages ?? false}
                                onChange={(checked) => { onChange({ ...config, allow_bot_messages: checked }); }}
                                disabled={false}
                                text="Allow Bot Messages to be Starred"
                            />
                            <ToggleSwitch
                                checked={config.keep_deleted_messages ?? false}
                                onChange={(checked) => { onChange({ ...config, keep_deleted_messages: checked }); }}
                                disabled={false}
                                text="Keep Starred Messages even when Deleted"
                            />
                        </div>
                    </div>
                )}

                {activeTab === "template" && (
                    <div className="space-y-2">
                        <PlaceholderList config={STARBOARD_CONFIG} />

                        <div className="space-y-2">
                            <InputLabel>Plaintext Message Template</InputLabel>
                            <PlaintextEditor
                                value={config.plaintext_template ?? ""}
                                onChange={(v) => { onChange({ ...config, plaintext_template: v }); }}
                                setIsEmpty={setIsEmpty}
                                emptyable
                            />
                        </div>

                        <div className="space-y-2 border-border-subtle">
                            <InputLabel required>Embed Template Settings</InputLabel>
                            <EmbedBuilder
                                config={STARBOARD_CONFIG}
                                initialEmbedState={config.embed_template}
                                setEmbedState={(obj) => { onChange({ ...config, embed_template: obj }); }}
                                customPreview={(
                                    <StarboardMessage
                                        config={STARBOARD_CONFIG}
                                        embed={convertToEmbedState(config.embed_template ?? {})}
                                        text={config.plaintext_template ?? ""}
                                    />
                                )}
                                enablePlaceholderList={false}
                            />
                        </div>
                    </div>
                )}

                {activeTab === "restrictions" && (
                    <div className="space-y-6 max-w-3xl">
                        <div className="p-4 rounded-lg border border-border-subtle space-y-2">
                            <Emphasis>Message Age Limits</Emphasis>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-0.5">
                                    <InputLabel>Min Message Age</InputLabel>
                                    <TextInput
                                        placeholder="e.g. 1 day"
                                        value={config.min_message_age ?? ""}
                                        onChange={(e) => { onChange({ ...config, min_message_age: e.target.value }); }}
                                    />
                                    <Footer className="text-muted-foreground">e.g. &quot;1 hour&quot;, &quot;30 minutes&quot;</Footer>
                                </div>
                                <div className="space-y-0.5">
                                    <InputLabel>Max Message Age</InputLabel>
                                    <TextInput
                                        placeholder="e.g. 90 days"
                                        value={config.max_message_age ?? ""}
                                        onChange={(e) => { onChange({ ...config, max_message_age: e.target.value }); }}
                                    />
                                    <Footer className="text-muted-foreground">e.g. &quot;90 days&quot;, &quot;7 days&quot;</Footer>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 rounded-lg border border-border-subtle space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-foreground">Role Restrictions</label>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Restrict starring capabilities to specific user roles.
                                </p>
                            </div>
                            <Dropdown
                                options={[
                                    { value: "NONE", label: "No Restrictions" },
                                    { value: "ALL_EXCEPT", label: "Ignore Selected Roles (Blacklist)" },
                                    { value: "ONLY_THESE", label: "Allow Only Selected Roles (Whitelist)" },
                                ]}
                                value={config.role_restriction_type ?? "NONE"}
                                onChange={(val) => { onChange({ ...config, role_restriction_type: val ?? "NONE" }); }}
                                className="max-w-md"
                            />
                            {config.role_restriction_type !== "NONE" && (
                                <div className="space-y-3 pt-2">
                                    <MultiSelectViewer
                                        selectedList={config.restricted_roles ?? []}
                                        onDelete={toggleRoleSelection}
                                        map={roleMap}
                                        prefix="@"
                                    />
                                    <Dropdown
                                        options={getAvailableRoleOptions(roleMap).filter(
                                            (opt) => !(config.restricted_roles ?? []).includes(opt.value)
                                        )}
                                        value={roleDropdownValue}
                                        onChange={(val) => {
                                            if (val !== null) toggleRoleSelection(val);
                                            setRoleDropdownValue("");
                                        }}
                                        placeholder="Add role restriction..."
                                        className="max-w-md"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="p-4 rounded-lg border border-border-subtle space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-foreground">Channel Restrictions</label>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Prevent or allow starring activity inside designated text channels.
                                </p>
                            </div>
                            <Dropdown
                                options={[
                                    { value: "NONE", label: "No Restrictions" },
                                    { value: "ALL_EXCEPT", label: "Ignore Selected Channels (Blacklist)" },
                                    { value: "ONLY_THESE", label: "Allow Only Selected Channels (Whitelist)" },
                                ]}
                                value={config.channel_restriction_type ?? "NONE"}
                                onChange={(val) => { onChange({ ...config, channel_restriction_type: val ?? "NONE" }); }}
                                className="max-w-md"
                            />
                            {config.channel_restriction_type !== "NONE" && (
                                <div className="space-y-3 pt-2">
                                    <MultiSelectViewer
                                        selectedList={config.restricted_channels ?? []}
                                        onDelete={toggleChannelSelection}
                                        map={channelMap}
                                        prefix="#"
                                    />
                                    <Dropdown
                                        options={getAvailableChannelOptions(channelMap).filter(
                                            (opt) => !(config.restricted_channels ?? []).includes(opt.value)
                                        )}
                                        value={channelDropdownValue}
                                        onChange={(val) => {
                                            if (val !== null) toggleChannelSelection(val);
                                            setChannelDropdownValue("");
                                        }}
                                        placeholder="Add channel restriction..."
                                        className="max-w-md"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}