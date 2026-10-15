import { describe, expect, it, vi } from "vitest";
import { buildSseUrl, buildSseAbsoluteUrl } from "@/lib/realtime-url";

vi.mock("@/features/realtime/actions", () => ({
    issueRealtimeTicketAction: vi.fn(async () => ({
        userId: "user_1",
        expires: 1234,
        sig: "sig_1",
    })),
}));
vi.mock("@/config", () => ({
    config: { publicBackendUrl: "http://backend:3000" },
}));

describe("buildSseUrl", () => {
    it("returns a relative sse url with ticket params", async () => {
        const url = await buildSseUrl("guild_1");
        expect(url).toContain("/api/sse/events?");
        expect(url).toContain("guild_id=guild_1");
        expect(url).toContain("user_id=user_1");
        expect(url).toContain("expires=1234");
        expect(url).toContain("sig=sig_1");
    });
});

describe("buildSseAbsoluteUrl", () => {
    it("returns an absolute sse url using public backend", async () => {
        const url = await buildSseAbsoluteUrl("guild_1");
        expect(url.startsWith("http://backend:3000/api/sse/events")).toBe(true);
        expect(url).toContain("guild_id=guild_1");
        expect(url).toContain("user_id=user_1");
    });
});
