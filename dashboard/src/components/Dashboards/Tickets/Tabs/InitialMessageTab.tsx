import { TicketConfig } from "@/types/db/config";
import { GenericMessageConfig, MessageConfigEditor } from "@/components/MessageCreator/MessageConfigEditor";
import { TICKETS_WELCOME_CONFIG } from "@/utils/embedTemplates";

export default function InitialMessageTab(props: {
    config: TicketConfig,
    onChange: (updated: GenericMessageConfig) => void,
    onEmbedChange: (embed: any) => void,
    disabled: boolean,
    resetKey: number,
    isEmpty: (value: (((prevState: boolean) => boolean) | boolean)) => void
}) {
    return <div className="flex flex-col gap-3">
        <div className="mt-2">
            <MessageConfigEditor
                config={props.config.welcomeMessage}
                onChange={props.onChange}
                onEmbedChange={props.onEmbedChange}
                channels={[]}
                disabled={props.disabled}
                toggleLabel="Customize Welcome Message"
                embedTemplateConfig={TICKETS_WELCOME_CONFIG}
                resetKey={`${props.resetKey}_welcome`}
                modeLabel="Message Mode (Welcome Message)"
                placeholderText="Hello {member.mention}, welcome to your ticket. Please describe your issue."
                setIsEmpty={props.isEmpty}
                noChannels
            />
        </div>
    </div>
}