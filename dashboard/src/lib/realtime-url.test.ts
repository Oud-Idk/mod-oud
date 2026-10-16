import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSseUrl, buildSseAbsoluteUrl } from "@/lib/realtime-url";
import { issueRealtimeTicketAction } from "@/features/realtime/actions";

vi.mock("@/features/realtime/actions", () => ({
    issueRealtimeTicketAction: vi.fn(() =>
        Promise.resolve({
            userId: "user_1",
            expires: 1234,
            sig: "sig_1",
        })
    ),
}));

vi.mock("@/config", () => ({
    config: { publicBackendUrl: "http://backend:3000" },
}));

describe("buildSseUrl", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("requests an 'sse' ticket and returns a relative sse url with ticket params", async () => {
        const url = await buildSseUrl("guild_1");
        expect(issueRealtimeTicketAction).toHaveBeenCalledWith("guild_1", "sse");

        // Exact match kills string mutations on the base path & query string structure
        expect(url).toBe(
            "/api/sse/events?guild_id=guild_1&user_id=user_1&expires=1234&sig=sig_1"
        );
    });
});

describe("buildSseAbsoluteUrl", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("requests an 'sse' ticket and returns an absolute sse url using public backend", async () => {
        const url = await buildSseAbsoluteUrl("guild_1");
        expect(issueRealtimeTicketAction).toHaveBeenCalledWith("guild_1", "sse");

        expect(url).toBe(
            "http://backend:3000/api/sse/events?guild_id=guild_1&user_id=user_1&expires=1234&sig=sig_1"
        );
    });
});