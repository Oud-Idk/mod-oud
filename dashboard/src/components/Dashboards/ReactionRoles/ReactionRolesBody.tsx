"use client";

import { SaveReactionMessageData } from "@/utils/db/reactionRoles";
import React, { ReactNode, useState } from "react";
import { ConfigListLayout } from "@/components/Dashboards/General/ConfigListLayout";
import { useParams, useRouter } from "next/navigation";
import { useConfigForm } from "@/hooks/useConfigForm";
import { ReactionRoleCreateModal } from "@/components/Dashboards/ReactionRoles/ReactionRoleCreateModal";
import { ReactionRoleConfig } from "@/components/Dashboards/ReactionRoles/ReactionRoleConfig";
import { SavePopup } from "@/components/Dashboards/General/SavePopup";
import { ReactionMessage } from "@/types/db/reactionRole";

interface ReactionRolesBodyProps {
    reactionRoles: ReactionMessage[];
    activeConfig: ReactionMessage;
    onSave: (config: SaveReactionMessageData) => Promise<ReactionMessage>;
    channelMap: Record<string, string>;
    onDelete: (id: number) => Promise<boolean>;
    onSend: (id: number) => Promise<{ message_id: string }>;
    roleMap: Record<string, string>;
    onDeleteDiscordMessage: (id: number) => Promise<{ success: boolean }>
}

export function ReactionRolesBody({
    reactionRoles,
    activeConfig,
    onSave,
    channelMap,
    onDelete,
    onSend,
    roleMap,
    onDeleteDiscordMessage,
}: ReactionRolesBodyProps) {
    const router = useRouter();
    const params = useParams();
    const guildId = params?.guild_id as string;

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

    return <div>
        <ConfigListLayout<ReactionMessage> title="Reaction Roles"
            onCreateClick={() => setIsCreateModalOpen(true)}
            items={reactionRoles}
            renderItem={function (item: ReactionMessage): ReactNode {
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
            noActivePlaceholder={<>
                <p className="text-sm">Select a reaction role message, or create a new
                    one to begin.</p>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="text-xs px-3.5 py-1.5 bg-zinc-850 rounded transition border border-neutral-500 hover:bg-neutral-300/10 cursor-pointer"
                >
                    Create Your First Reaction Role
                </button>
            </>}
        >
            <ReactionRoleConfig
                key={config?.id}
                config={config!}
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
        </ConfigListLayout>

        <ReactionRoleCreateModal
            isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} onSave={(v) => onSave({
            channel_id: v.channel_id || "",
            guild_id: guildId,
            format: 'TEXT',
            name: v.name || "",
            embed: {},
            content: "",
            mode: v.mode || "REACTION",
        })} channelMap={channelMap}
        />

        {isDirty && (
            <SavePopup
                handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending}
            />
        )}
    </div>
}