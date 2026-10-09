import { describe, it, expect } from "vitest";
import { DELIVERY, FEED_DELIVERY, formatTimestamp, pollIntervalMinutes } from "./delivery";
import { feedDeliverySchema, type RssFeedSubscription } from "./types";

describe("pollIntervalMinutes", () => {
    it("should convert seconds to whole minutes", () => {
        expect(pollIntervalMinutes(1200)).toBe(20);
        expect(pollIntervalMinutes(90)).toBe(2);
    });

    it("should fall back to the 10 minute default when the feed reports no interval", () => {
        expect(pollIntervalMinutes(null)).toBe(10);
        expect(pollIntervalMinutes(undefined)).toBe(10);
    });

    it("should never round a cadence below one minute", () => {
        expect(pollIntervalMinutes(30)).toBe(1);
        expect(pollIntervalMinutes(0)).toBe(1);
    });
});

describe("formatTimestamp", () => {
    it("should render a parseable timestamp", () => {
        const date = new Date("2026-09-27T10:00:00.000Z");
        expect(formatTimestamp(date)).toBe(date.toLocaleString());
    });

    it("should report absent and unparseable timestamps alike", () => {
        expect(formatTimestamp(null)).toBe("never");
        expect(formatTimestamp(undefined)).toBe("never");
        expect(formatTimestamp(new Date("not-a-date"))).toBe("never");
    });
});

describe("DELIVERY presentation table", () => {
    const row = (overrides: Partial<RssFeedSubscription>): RssFeedSubscription => ({
        feedId: "6f9619ff-8b86-4111-b42d-00cf4fc964ff",
        url: "https://example.com/feed.xml",
        channelId: "123456789012345678",
        delivery: FEED_DELIVERY.POLLING,
        hubUrl: null,
        topic: null,
        leaseExpiresAt: null,
        intervalSecs: 600,
        lastPolledAt: null,
        ...overrides,
    });

    it("should describe every delivery variant the schema allows", () => {
        for (const variant of feedDeliverySchema.options) {
            expect(DELIVERY[variant]).toBeDefined();
        }
    });

    it("should label each mechanism", () => {
        expect(DELIVERY[FEED_DELIVERY.PUBSUBHUBBUB].label).toBe("WebSub");
        expect(DELIVERY[FEED_DELIVERY.POLLING].label).toBe("Polling");
    });

    it("should describe a polled feed by its cadence", () => {
        const detail = DELIVERY[FEED_DELIVERY.POLLING].detail(
            row({ intervalSecs: 1800, lastPolledAt: new Date("2026-09-26T10:00:00.000Z") })
        );

        expect(detail).toContain("Every 30 min");
        expect(detail).toContain("last polled");
    });

    it("should describe a pushed feed by its lease", () => {
        const detail = DELIVERY[FEED_DELIVERY.PUBSUBHUBBUB].detail(
            row({ delivery: FEED_DELIVERY.PUBSUBHUBBUB, leaseExpiresAt: new Date("2026-09-27T10:00:00.000Z") })
        );

        expect(detail).toContain("Lease expires");
        expect(detail).not.toContain("never");
    });

    it("should give each mechanism distinct badge styling", () => {
        expect(DELIVERY[FEED_DELIVERY.PUBSUBHUBBUB].badgeClassName).not.toBe(
            DELIVERY[FEED_DELIVERY.POLLING].badgeClassName
        );
    });
});
