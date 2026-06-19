import { TicketConfig } from "@/types/config";
import { GenericMessageConfig, MessageConfigEditor } from "@/components/MessageCreator/MessageConfigEditor";
import { TICKETS_PANEL_CONFIG } from "@/utils/embedTemplates";

export default function InitialMessageTab(props: {
    status: { type: "success" | "error"; message: string } | null,
    config: TicketConfig,
    onChange: (updated: GenericMessageConfig) => void,
    onEmbedChange: (embed: any) => void,
    disabled: boolean,
    resetKey: number,
    isEmpty: (value: (((prevState: boolean) => boolean) | boolean)) => void
}) {
    return <div className="flex flex-col gap-3">
        {props.status && (
            <p className={`text-sm ${props.status.type === "success" ? "text-green-600" : "text-red-600"}`}>
                {props.status.message}
            </p>
        )}

        <div className="mt-2">
            <MessageConfigEditor
                config={props.config.welcome_message}
                onChange={props.onChange}
                onEmbedChange={props.onEmbedChange}
                channels={[]}
                disabled={props.disabled}
                toggleLabel="Customize Welcome Message"
                embedTemplateConfig={TICKETS_PANEL_CONFIG}
                resetKey={`${props.resetKey}_welcome`}
                modeLabel="Message Mode (Welcome Message)"
                placeholderText="Hello {member.mention}, welcome to your ticket. Please describe your issue."
                setIsEmpty={props.isEmpty}
                noChannels
            />
        </div>
    </div>
}