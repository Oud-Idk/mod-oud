import { TicketConfig } from "@/features/tickets/types";
import { TICKETS_WELCOME_CONFIG } from "@/features/tickets/builderConfigs";
import { GenericMessageConfig } from "@/features/_shared/message-creator/types";
import { MessageConfigEditor } from "@/features/_shared/message-creator/components/MessageConfigEditor";
import { DiscordEmbed } from "@/features/_shared/embed";
import { JSX } from "react";

interface InitialMessageTabProps {
    config: TicketConfig,
    onChange: (updated: GenericMessageConfig) => void,
    onEmbedChange: (embed: DiscordEmbed) => void,
    disabled: boolean,
    resetKey: number,
}


export default function InitialMessageTab({ config, onChange, onEmbedChange, disabled, resetKey }: InitialMessageTabProps): JSX.Element {
    return <div className="flex flex-col gap-3">
            <MessageConfigEditor
                config={config.welcomeMessage.message}
                onChange={onChange}
                onEmbedChange={onEmbedChange}
                channels={[]}
                disabled={disabled}
                toggleLabel="Customize Welcome Message"
                embedTemplateConfig={TICKETS_WELCOME_CONFIG}
                resetKey={`${resetKey}_welcome`}
                modeLabel="Message Mode (Welcome Message)"
                placeholderText="Hello {member.mention}, welcome to your ticket. Please describe your issue."
                noChannels
            />
    </div>
}