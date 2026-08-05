"use client";

import React, { ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfigListLayout } from "@/components/dashboard/ConfigListLayout";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { useConfigForm } from "@/components/dashboard/useConfigForm";

import { ReactionRoleCreateModal } from "./ReactionRoleCreateModal";
import { ReactionRoleConfig } from "./ReactionRoleConfig";
import type { ReactionMessage, SaveReactionMessageInput } from "../types";

interface ReactionRolesBodyProps {
    guildId: string;
    reactionRoles: ReactionMessage[];
    activeConfig: ReactionMessage | null; // 👈 Allows null when list is empty
    channelMap: Record<string, string>;
    roleMap: Record<string, string>;
    onSave: (config: SaveReactionMessageInput) => Promise<ReactionMessage>;
    onDelete: (id: number) => Promise<boolean>;
    onSend: (id: number) => Promise<{ message_id: string }>;
    onDeleteDiscordMessage: (id: number) => Promise<{ success: boolean }>;
}

export function ReactionRolesBody({
    guildId,
    reactionRoles,
    activeConfig,
    channelMap,
    roleMap,
    onSave,
    onDelete,
    onSend,
    onDeleteDiscordMessage,
}: ReactionRolesBodyProps): ReactNode {
    const router = useRouter();

    const {
        config,
        isPending,
        isDirty,
        isEmpty,
        setIsEmpty,
        handleSave,
        handleCancel,
        handleChange,
    } = useConfigForm<ReactionMessage | null>({
        initialConfig: activeConfig,
        onSave: async (updatedConfig) => {
            if (updatedConfig) await onSave(updatedConfig);
        },
    });

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    return (
        <div>
            <ConfigListLayout<ReactionMessage>
                title="Reaction Roles"
                onCreateClick={() => setIsCreateModalOpen(true)}
                items={reactionRoles}
                renderItem={(item: ReactionMessage): ReactNode => {
                    const isCurrent = activeConfig?.id === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => router.push(`/dashboard/${guildId}/reaction-roles?id=${item.id}`)}
                            className={`w-full text-left px-3 py-2 rounded text-sm transition block cursor-pointer truncate ${
                                isCurrent
                                    ? "bg-neutral-400/15 hover:bg-neutral-400/20 font-medium"
                                    : "hover:bg-neutral-300/15"
                            }`}
                        >
                            <div className="truncate font-semibold">{item.name}</div>
                        </button>
                    );
                }}
                hasActiveConfig={!!config}
                handleSave={handleSave}
                handleCancel={handleCancel}
                noActivePlaceholder={
                    <>
            <p className="text-sm">
              Select a reaction role message, or create a new one to begin.
            </p>
            <button
                onClick={() => setIsCreateModalOpen(true)}
                className="text-xs px-3.5 py-1.5 bg-zinc-850 rounded transition border border-neutral-500 hover:bg-neutral-300/10 cursor-pointer"
            >
              Create Your First Reaction Role
            </button>
          </>
                }
            >
                {config && (
                    <ReactionRoleConfig
                        key={config.id}
                        config={config}
                        channelMap={channelMap}
                        roleMap={roleMap}
                        isPending={isPending}
                        isDirty={isDirty}
                        onDelete={onDelete}
                        onSend={onSend}
                        guildId={guildId}
                        onChange={handleChange}
                        setIsEmpty={setIsEmpty}
                        isEmpty={isEmpty}
                        onDeleteDiscordMessage={onDeleteDiscordMessage}
                    />
                )}
            </ConfigListLayout>

            <ReactionRoleCreateModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                channelMap={channelMap}
                onSave={(v) =>
                    onSave({
                        channel_id: v.channel_id || "",
                        guild_id: guildId,
                        format: "TEXT",
                        name: v.name || "",
                        embed: {},
                        content: "",
                        mode: v.mode || "REACTION",
                    })
                }
            />

            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel}
                    handleSave={handleSave}
                    isSaving={isPending}
                />
            )}
        </div>
    );
}