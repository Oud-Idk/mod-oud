import { z } from "zod";
import { config } from "@/config";
import { issueRealtimeTicketAction } from "@/features/realtime/actions";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface NowPlayingData {
    title: string;
    thumbnail?: string;
    requestedBy?: string;
    durationSec?: number;
    positionSec?: number;
    isPaused?: boolean;
    isLive?: boolean;
}

export interface PendingRequest {
    resolve: (data: unknown) => void;
    reject: (reason: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
}

export const noop = (_err?: unknown): void => {
    // Silently ignored background handler
};

export const ackSchema = z.object({
    type: z.literal("ack"),
    requestId: z.string().optional(),
    ok: z.boolean(),
    error: z.string().optional(),
    data: z.unknown().optional(),
});

export const eventSchema = z.object({
    type: z.literal("event"),
    event: z.string(),
    data: z.unknown().optional(),
});

const durationObjectSchema = z.object({
    secs: z.number().optional(),
    seconds: z.number().optional(),
    duration: z.number().optional(),
});

const durationSchema = z.union([z.number(), z.string(), durationObjectSchema, z.null()]).optional();
const requesterSchema = z.union([z.string(), z.looseObject({ name: z.string() })]).optional();

export const nowPlayingPayloadSchema = z.object({
    title: z.string().optional(),
    thumbnail: z.string().optional(),
    requested_by: requesterSchema,
    requestedBy: requesterSchema,
    duration: durationSchema,
    durationSec: durationSchema,
    position_sec: z.number().optional(),
    positionSec: z.number().optional(),
    is_paused: z.boolean().optional(),
    isPaused: z.boolean().optional(),
    is_live: z.boolean().optional(),
    isLive: z.boolean().optional(),
    metadata: z.object({
        title: z.string().optional(),
        thumbnail: z.string().optional(),
        duration: durationSchema,
        durationSec: durationSchema,
    }).optional(),
});

export async function wsUrlWithTicket(guildId: string): Promise<string> {
    const base = config.publicBackendUrl.replace(/^http/, "ws");
    const ticket = await issueRealtimeTicketAction(guildId, "ws");
    const params = new URLSearchParams({
        guild_id: guildId,
        user_id: ticket.userId,
        expires: String(ticket.expires),
        sig: ticket.sig,
    });
    return `${base}/api/ws/control?${params.toString()}`;
}

export function parseRequester(raw: unknown): string | undefined {
    if (typeof raw === "string") return raw;
    if (typeof raw === "object" && raw !== null && "name" in raw && typeof raw.name === "string") {
        return raw.name;
    }
    return undefined;
}

export function parseDuration(raw: unknown): number {
    if (typeof raw === "number") return raw;
    if (raw === null) return 0;
    if (typeof raw === "string") {
        const parsed = Number.parseFloat(raw);
        if (!Number.isNaN(parsed)) return parsed;
    }
    const parseResult = durationObjectSchema.safeParse(raw);
    if (parseResult.success) {
        const { secs, seconds, duration } = parseResult.data;
        if (typeof secs === "number") return secs;
        if (typeof seconds === "number") return seconds;
        if (typeof duration === "number") return duration;
    }
    return 0;
}
