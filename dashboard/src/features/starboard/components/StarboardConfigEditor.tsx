"use client";

import React, { ReactNode, SetStateAction, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { Dropdown } from "@/components/ui/Dropdown";
import { MultiSelectViewer } from "@/components/ui/MultiSelectViewer";
import { StarboardMessage } from "@/features/starboard/components/StarboardMessage";
import { PlaceholderList } from "@/features/_shared/message-creator/components/PlaceholderList";
import { Pad } from "@/components/layout/Pad";
import { PlaintextEditor } from "@/features/_shared/message-creator/components/PlaintextEditor";

import { StarboardConfigInput } from "@/features/starboard/types";
import { STARBOARD_CONFIG } from "@/features/starboard/builderConfigs";
import EmbedBuilder, { convertToEmbedState } from "@/features/_shared/message-creator/components/EmbedBuilder";

function validateIntervalFormat(value: string | null): boolean {
    if (!value || value.trim() === "") return true; // Empty is valid

    const intervalRegex = /^(\d+\s+(year|month|week|day|hour|minute|second)s?(\s+|$))+$/i;
    return intervalRegex.test(value.trim());
}

interface StarboardConfigProps {
    config: StarboardConfigInput;
    channelMap: Record<string, string>;
    roleMap?: Record<string, string>;
    isPending: boolean;
    onDelete: (id: string) => Promise<void>;
    onChange: (updated: StarboardConfigInput) => void;
    setIsEmpty: (isEmpty: SetStateAction<boolean>) => void;
    guildId: string;
}

export function StarboardConfigEditor({
    config,
    channelMap,
    roleMap = {},
    isPending,
    onDelete,
    onChange,
    setIsEmpty,
    guildId,
}: StarboardConfigProps): ReactNode {
    const router = useRouter();

    const [roleDropdownValue, setRoleDropdownValue] = useState("");
    const [channelDropdownValue, setChannelDropdownValue] = useState("");
    const [emojiInput, setEmojiInput] = useState("");
    const [minAgeInput, setMinAgeInput] = useState<string>(config.min_message_age || "");
    const [maxAgeInput, setMaxAgeInput] = useState<string>(config.max_message_age || "");
    const [validationErrors, setValidationErrors] = useState<{
        minAge?: string;
        maxAge?: string;
    }>({});


    // Arrays modifications helpers
    const toggleRoleSelection = (roleId: string): void => {
        const current = config.restricted_roles || [];
        const updated = current.includes(roleId)
            ? current.filter((id) => id !== roleId)
            : [...current, roleId];
        onChange({ ...config, restricted_roles: updated });
    };

    const toggleChannelSelection = (chanId: string): void => {
        const current = config.restricted_channels || [];
        const updated = current.includes(chanId)
            ? current.filter((id) => id !== chanId)
            : [...current, chanId];
        onChange({ ...config, restricted_channels: updated });
    };

    const handleAddEmoji = (e: React.FormEvent): void => {
        e.preventDefault();
        const trimmed = emojiInput.trim();
        if (!trimmed) return;

        const current = config.emojis || [];
        if (!current.includes(trimmed)) {
            onChange({ ...config, emojis: [...current, trimmed] });
        }
        setEmojiInput("");
    };

    const handleRemoveEmoji = (emoji: string): void => {
        const current = config.emojis || [];
        onChange({ ...config, emojis: current.filter((em) => em !== emoji) });
    };

    const handleDelete = (id: string): void => {
        onDelete(id).then(() => {
            router.push(`/dashboard/${guildId}/starboard`);
        }).catch(() => {
            alert("Failed to delete configuration.");
        });
    };

    const handleMinAgeChange = (value: string): void => {
        // always update the local input so the user can type freely
        setMinAgeInput(value);
        const trimmedValue = value.trim();
        if (trimmedValue === "") {
            setValidationErrors((prev) => {
                const next = { ...prev };
                delete next.minAge;
                return next;
            });
            // clear the config value when input is empty
            onChange({ ...config, min_message_age: null });
        } else if (validateIntervalFormat(trimmedValue)) {
            // valid final format -> clear error and update config
            setValidationErrors((prev) => {
                const next = { ...prev };
                delete next.minAge;
                return next;
            });
            onChange({ ...config, min_message_age: trimmedValue });
        } else {
            // keep showing the user's partial input but show a helpful validation message
            setValidationErrors((prev) => ({
                ...prev,
                minAge: 'Invalid format. Use patterns like "1 day", "5 hours", "2 weeks 3 days"'
            }));
        }
    };

    const handleMaxAgeChange = (value: string): void => {
        // always update the local input so the user can type freely
        setMaxAgeInput(value);
        const trimmedValue = value.trim();
        if (trimmedValue === "") {
            setValidationErrors((prev) => {
                const next = { ...prev };
                delete next.maxAge;
                return next;
            });
            onChange({ ...config, max_message_age: null });
        } else if (validateIntervalFormat(trimmedValue)) {
            setValidationErrors((prev) => {
                const next = { ...prev };
                delete next.maxAge;
                return next;
            });
            onChange({ ...config, max_message_age: trimmedValue });
        } else {
            setValidationErrors((prev) => ({
                ...prev,
                maxAge: 'Invalid format. Use patterns like "90 days", "7 days", "2 weeks"'
            }));
        }
    };

    // Sync local inputs when external config changes (e.g. selecting another board)
    useEffect(() => {
        setMinAgeInput(config.min_message_age || "");
        setMaxAgeInput(config.max_message_age || "");
    }, [config.min_message_age, config.max_message_age]);

    const id = config.id;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-medium">
                        #{channelMap[config.starboard_channel_id || ""] || "Starboard"}
                    </h3>
                </div>

                {id && (
                    <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleDelete(id)}
                        className="px-4 py-2 text-sm cursor-pointer border-red-500 border hover:bg-red-300/10 rounded transition"
                    >
                        Delete Starboard </button>
                )}
            </div>

            <div className="space-y-4">
                <div className="space-y-2">
                    <label className="block text-sm font-medium">Destination Channel</label>
                    <Dropdown
                        options={Object.entries(channelMap).map(([id, name]) => ({
                            value: id,
                            label: `#${name}`,
                        }))}
                        value={config.starboard_channel_id || ""}
                        onChange={(val) => onChange({ ...config, starboard_channel_id: val })}
                        placeholder="Select channel..."
                        className="max-w-md"
                    />
                </div>

                {/* Embed Builder */}
                <div>
                    <PlaceholderList config={STARBOARD_CONFIG}/>
                    <Pad/>
                    <PlaintextEditor
                        value={config.plaintext_template || ""}
                        onChange={v => onChange({ ...config, plaintext_template: v })}
                        setIsEmpty={setIsEmpty}
                        emptyable
                    />
                    <Pad/>
                    <EmbedBuilder
                        config={STARBOARD_CONFIG}
                        initialEmbedState={config.embed_template}
                        setEmbedState={(obj) => onChange({ ...config, embed_template: obj })}
                        customPreview={(
                            <StarboardMessage
                                config={STARBOARD_CONFIG}
                                embed={convertToEmbedState(config.embed_template || {})}
                                text={config.plaintext_template || ''}
                            />
                        )}
                        enablePlaceholderList={false}
                        setIsEmpty={setIsEmpty}
                    />
                </div>

                {/* Required Stars */}
                <div className="space-y-2">
                    <label className="block text-sm font-medium">Required Stars</label>
                    <input
                        type="number"
                        min={1}
                        value={config.reaction_threshold || 3}
                        onChange={(e) =>
                            onChange({
                                ...config,
                                reaction_threshold: parseInt(e.target.value) || 1,
                            })
                        }
                        className="border bg-neutral-300/10 border-neutral-500 rounded px-3 py-2 text-sm w-32 focus:outline-none"
                    />
                </div>

                {/* Message Age Constraints */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="block text-sm font-medium">Min Message Age</label>
                        <input
                            type="text"
                            placeholder="e.g. 1 day"
                            value={minAgeInput}
                            onChange={(e) => handleMinAgeChange(e.target.value)}
                            className={`border rounded px-3 py-2 text-sm w-full focus:outline-none bg-neutral-300/10 ${
                                validationErrors.minAge
                                    ? "border-red-900/50"
                                    : "border-neutral-500"
                            }`}
                        />
                        {validationErrors.minAge ? (
                            <p className="text-xs text-red-400">{validationErrors.minAge}</p>
                        ) : (
                            <p className="text-xs text-zinc-500">e.g. &quot;1 day&quot;, &quot;5 hours&quot;, &quot;30 minutes&quot;</p>
                        )}
                    </div>
                    <div className="space-y-2">
                        <label className="block text-sm font-medium">Max Message Age</label>
                        <input
                            type="text"
                            placeholder="e.g. 90 days"
                            value={maxAgeInput}
                            onChange={(e) => handleMaxAgeChange(e.target.value)}
                            className={`border rounded px-3 py-2 text-sm w-full focus:outline-none bg-neutral-300/10 ${
                                validationErrors.maxAge
                                    ? "border-red-900/50"
                                    : "border-neutral-500"
                            }`}
                        />
                        {validationErrors.maxAge ? (
                            <p className="text-xs text-red-400">{validationErrors.maxAge}</p>
                        ) : (
                            <p className="text-xs text-zinc-500">e.g. &quot;90 days&quot;, &quot;7 days&quot;, &quot;14 days&quot;</p>
                        )}
                    </div>
                </div>

                {/* Tracking Emojis */}
                <div className="space-y-2">
                    <label className="block text-sm font-medium">Tracked Emojis</label>
                    <MultiSelectViewer
                        selectedList={config.emojis || []}
                        onDelete={(em) => handleRemoveEmoji(em)}
                        placeholder="Uses ⭐ by default"
                    />
                    <form onSubmit={handleAddEmoji} className="flex gap-2 max-w-sm mt-1">
                        <input
                            type="text"
                            placeholder="Add emoji (e.g. ⭐)"
                            value={emojiInput}
                            onChange={(e) => setEmojiInput(e.target.value)}
                            className="border border-neutral-500 bg-neutral-300/10 rounded px-3 py-1 text-sm flex-1 focus:outline-none"
                        />
                        <button
                            type="submit" className="px-3 py-1 bg-zinc-850 hover:bg-zinc-800 text-sm rounded"
                        >
                            Add
                        </button>
                    </form>
                </div>

                {/* Switch Options */}
                <div className="space-y-3 pt-2">
                    <ToggleSwitch
                        checked={config.prevent_self_star || false}
                        onChange={(checked) => onChange({ ...config, prevent_self_star: checked })}
                        disabled={false}
                        text="Prevent Self-Starring"
                    />
                    <ToggleSwitch
                        checked={config.allow_bot_messages || false}
                        onChange={(checked) => onChange({ ...config, allow_bot_messages: checked })}
                        disabled={false}
                        text="Allow Bot Messages to be Starred"
                    />
                    <ToggleSwitch
                        checked={config.keep_deleted_messages || false}
                        onChange={(checked) => onChange({ ...config, keep_deleted_messages: checked })}
                        disabled={false}
                        text="Keep Starred Messages even when Deleted"
                    />
                </div>

                {/* Restrictions Segment */}
                <div className="space-y-4 pt-4 border-t border-zinc-850">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                        Access & Restrictions </h4>

                    {/* Roles */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-zinc-300">Role Restriction</label>
                        <Dropdown
                            options={[
                                { value: "NONE", label: "No Restrictions" },
                                { value: "ALL_EXCEPT", label: "Ignore (Blacklist)" },
                                { value: "ONLY_THESE", label: "Allow Only (Whitelist)" },
                            ]} value={config.role_restriction_type || "NONE"} onChange={(val) =>
                            onChange({
                                ...config,
                                role_restriction_type: val,
                            })
                        } className="max-w-xs"
                        />
                        {config.role_restriction_type !== "NONE" && (
                            <div className="space-y-2 mt-2">
                                <MultiSelectViewer
                                    selectedList={config.restricted_roles || []}
                                    onDelete={toggleRoleSelection}
                                    map={roleMap}
                                    prefix="@"
                                />
                                <Dropdown
                                    options={Object.entries(roleMap)
                                        .filter(([id]) => !(config.restricted_roles || []).includes(id))
                                        .map(([id, name]) => ({ value: id, label: `@${name}` }))}
                                    value={roleDropdownValue}
                                    onChange={(val) => {
                                        if (val) toggleRoleSelection(val);
                                        setRoleDropdownValue("");
                                    }}
                                    placeholder="Select role..."
                                    className="max-w-xs"
                                />
                            </div>
                        )}
                    </div>

                    {/* Channels */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-zinc-300">Channel Restriction</label>
                        <Dropdown
                            options={[
                                { value: "NONE", label: "No Restrictions" },
                                { value: "ALL_EXCEPT", label: "Ignore (Blacklist)" },
                                { value: "ONLY_THESE", label: "Allow Only (Whitelist)" },
                            ]} value={config.channel_restriction_type || "NONE"} onChange={(val) =>
                            onChange({
                                ...config,
                                channel_restriction_type: val,
                            })
                        } className="max-w-xs"
                        />
                        {config.channel_restriction_type !== "NONE" && (
                            <div className="space-y-2 mt-2">
                                <MultiSelectViewer
                                    selectedList={config.restricted_channels || []}
                                    onDelete={toggleChannelSelection}
                                    map={channelMap}
                                    prefix="#"
                                />
                                <Dropdown
                                    options={Object.entries(channelMap)
                                        .filter(([id]) => !(config.restricted_channels || []).includes(id))
                                        .map(([id, name]) => ({ value: id, label: `#${name}` }))}
                                    value={channelDropdownValue}
                                    onChange={(val) => {
                                        if (val) toggleChannelSelection(val);
                                        setChannelDropdownValue("");
                                    }}
                                    placeholder="Select channel..."
                                    className="max-w-xs"
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

