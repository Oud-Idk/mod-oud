import { JSX } from "react";
import { ConnectionStatusPill } from "@/components/ui/ConnectionStatusPill";
import { getBotProcessStatus } from "../../queries/health";
import { getTelemetry } from "../../queries/telemetry";
import { TelemetryCards } from "./telemetry/TelemetryCards";

export async function BotStatusPill(): Promise<JSX.Element> {
    const online = await getBotProcessStatus();

    return (
        <ConnectionStatusPill
            status={online ? "CONNECTED" : "DISCONNECTED"}
            connectedText="Bot Online"
            disconnectedText="Bot Offline"
        />
    );
}

export async function TelemetrySection(): Promise<JSX.Element | null> {
    return <TelemetryCards telemetry={await getTelemetry()} />;
}
