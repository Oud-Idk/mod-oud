"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { StarboardConfigInput } from "@/types/config/starboard";
import { ToggleSwitch } from "@/components/Dashboards/General/ToggleSwitch";
import { Dropdown } from "@/components/Dropdown";
import { MultiSelectViewer } from "@/components/MultiSelectViewer";
import GenericEmbedBuilder, { convertToEmbedState } from "@/components/Embed/GenericEmbedBuilder";
import { STARBOARD_CONFIG } from "@/utils/embedTemplates";
import { StarboardMessage } from "@/components/Dashboards/Starboard/StarboardMessage";
import { PlaceholderList } from "@/components/Embed/PlaceholderList";
import { Pad } from "@/components/Pad";
import { PlaintextEditor } from "@/components/MessageCreator/PlaintextEditor";

// Validation function for PostgreSQL interval format
function validateIntervalFormat(value: string | null): boolean {
    if (!value || value.trim() === "") return true; // Empty is valid

    // Accepted PostgreSQL interval format: number + unit (with optional pluralization)
    // Examples: "1 day", "5 hours", "30 minutes", "2 weeks 3 days", "1 year 2 months"
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
}

export function StarboardConfig({
    config,
    channelMap,
    roleMap = {},
    isPending,
    onDelete,
    onChange,
}: StarboardConfigProps) {
    const router = useRouter();
    const params = useParams();
    const guildId = params?.guild_id as string;

    // Form selectors local states
    const [roleDropdownValue, setRoleDropdownValue] = useState("");
    const [channelDropdownValue, setChannelDropdownValue] = useState("");
    const [emojiInput, setEmojiInput] = useState("");
    // local controlled inputs so users can type incomplete values like "90 d" -> "90 days"
    const [minAgeInput, setMinAgeInput] = useState<string>(config.min_message_age || "");
    const [maxAgeInput, setMaxAgeInput] = useState<string>(config.max_message_age || "");
    const [validationErrors, setValidationErrors] = useState<{
        minAge?: string;
        maxAge?: string;
    }>({});


    // Arrays modifications helpers
    const toggleRoleSelection = (roleId: string) => {
        const current = config.restricted_roles || [];
        const updated = current.includes(roleId)
            ? current.filter((id) => id !== roleId)
            : [...current, roleId];
        onChange({ ...config, restricted_roles: updated });
    };

    const toggleChannelSelection = (chanId: string) => {
        const current = config.restricted_channels || [];
        const updated = current.includes(chanId)
            ? current.filter((id) => id !== chanId)
            : [...current, chanId];
        onChange({ ...config, restricted_channels: updated });
    };

    const handleAddEmoji = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = emojiInput.trim();
        if (!trimmed) return;

        const current = config.emojis || [];
        if (!current.includes(trimmed)) {
            onChange({ ...config, emojis: [...current, trimmed] });
        }
        setEmojiInput("");
    };

    const handleRemoveEmoji = (emoji: string) => {
        const current = config.emojis || [];
        onChange({ ...config, emojis: current.filter((em) => em !== emoji) });
    };

    const handleDelete = (id: string) => {
        if (!confirm("Are you sure you want to delete this starboard?")) return;
        onDelete(id).then(() => {
            router.push(`/dashboard/${guildId}/starboard`);
        }).catch(() => {
            alert("Failed to delete configuration.");
        });
    };

    const handleMinAgeChange = (value: string) => {
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

    const handleMaxAgeChange = (value: string) => {
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

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">
                    Configure #{channelMap[config.starboard_channel_id || ""] || "Starboard"}
                </h3>
                <p className="text-xs text-zinc-500">Edit guidelines, emojis, and access filters.</p>
            </div>

            <div className="space-y-4">
                {/* Destination Channel */}
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
                    />
                    <Pad/>
                    <GenericEmbedBuilder
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
                    />
                </div>

                {/* Required Stars */}
                <div className="space-y-2">
                    <label className="block text-sm font-medium">Required Stars</label>
                    <input
                        type="number" min={1} value={config.reaction_threshold || 3} onChange={(e) =>
                        onChange({
                            ...config,
                            reaction_threshold: parseInt(e.target.value) || 1,
                        })
                    } className="border rounded px-3 py-2 text-sm w-32 focus:outline-none"
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
                            className={`border rounded px-3 py-2 text-sm w-full focus:outline-none ${
                                validationErrors.minAge
                                    ? "border-red-900/50"
                                    : "border-zinc-800"
                            }`}
                        />
                        {validationErrors.minAge ? (
                            <p className="text-xs text-red-400">{validationErrors.minAge}</p>
                        ) : (
                            <p className="text-xs text-zinc-500">e.g. "1 day", "5 hours", "30 minutes"</p>
                        )}
                    </div>
                    <div className="space-y-2">
                        <label className="block text-sm font-medium">Max Message Age</label>
                        <input
                            type="text"
                            placeholder="e.g. 90 days"
                            value={maxAgeInput}
                            onChange={(e) => handleMaxAgeChange(e.target.value)}
                            className={`border rounded px-3 py-2 text-sm w-full focus:outline-none ${
                                validationErrors.maxAge
                                    ? "border-red-900/50"
                                    : "border-zinc-800"
                            }`}
                        />
                        {validationErrors.maxAge ? (
                            <p className="text-xs text-red-400">{validationErrors.maxAge}</p>
                        ) : (
                            <p className="text-xs text-zinc-500">e.g. "90 days", "7 days", "14 days"</p>
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
                            className="border rounded px-3 py-1 text-sm flex-1 focus:outline-none"
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
                        enabled={config.prevent_self_star || false}
                        onChange={(checked) => onChange({ ...config, prevent_self_star: checked })}
                        disabled={false}
                        text="Prevent Self-Starring"
                    />
                    <ToggleSwitch
                        enabled={config.allow_bot_messages || false}
                        onChange={(checked) => onChange({ ...config, allow_bot_messages: checked })}
                        disabled={false}
                        text="Allow Bot Messages to be Starred"
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
                                { value: "none", label: "No Restrictions" },
                                { value: "all_except", label: "Ignore (Blacklist)" },
                                { value: "only_these", label: "Allow Only (Whitelist)" },
                            ]} value={config.role_restriction_type || "none"} onChange={(val) =>
                            onChange({
                                ...config,
                                role_restriction_type: val as any,
                            })
                        } className="max-w-xs"
                        />
                        {config.role_restriction_type !== "none" && (
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
                                { value: "none", label: "No Restrictions" },
                                { value: "all_except", label: "Ignore (Blacklist)" },
                                { value: "only_these", label: "Allow Only (Whitelist)" },
                            ]} value={config.channel_restriction_type || "none"} onChange={(val) =>
                            onChange({
                                ...config,
                                channel_restriction_type: val as any,
                            })
                        } className="max-w-xs"
                        />
                        {config.channel_restriction_type !== "none" && (
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

            {config.id && (
                <div className="pt-6 border-t border-zinc-850 flex justify-end">
                    <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleDelete(config.id as string)}
                        className="px-4 py-2 text-sm cursor-pointer border-red-500 border hover:bg-red-300/10 rounded transition"
                    >
                        Delete This Starboard
                    </button>
                </div>
            )}
        </div>
    );
}

