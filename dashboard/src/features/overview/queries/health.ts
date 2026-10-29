import { config } from "@/config";

/** True when the bot process answers its health endpoint within a second. */
export async function getBotProcessStatus(): Promise<boolean> {
    try {
        const response = await fetch(`${config.backendInternalUrl}/health`, {
            signal: AbortSignal.timeout(1000),
        });
        return response.ok;
    } catch {
        return false;
    }
}
