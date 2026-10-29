import { backendFetch } from "@/lib/backend";
import { TelemetryReport, TelemetryReportSchema } from "../types";

export async function getTelemetry(): Promise<TelemetryReport | null> {
    try {
        const response = await backendFetch("/api/telemetry", {
            signal: AbortSignal.timeout(2000),
        });

        if (!response.ok) return null;

        const rawData: unknown = await response.json();
        const parsed = TelemetryReportSchema.safeParse(rawData);
        if (!parsed.success) {
            console.error("Failed to parse telemetry data:", parsed.error);
            return null;
        }

        return parsed.data;
    } catch {
        return null;
    }
}
