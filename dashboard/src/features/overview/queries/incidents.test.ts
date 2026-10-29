import { describe, it, expect } from "vitest";
import { describeRaidEvent } from "./incidents";

const ALERT = [
    "# Raid detected! Statistics",
    "- Current joins in the past minute: 42",
    "- Average joins per minute: 1.5",
    "- Standard deviation per minute: 0.8",
    "- Calculated threshold: 5",
    "Triggered by user `spammer`.",
].join("\n");

describe("describeRaidEvent", () => {
    it("reads the join count from an automatic trigger", () => {
        expect(describeRaidEvent("TRIGGERED", { message: ALERT })).toEqual({
            title: "Raid detected",
            details: "42 joins in the last minute exceeded the threshold",
            actor: "Anti-Raid Guard",
        });
    });

    it("falls back when the alert message has no join count", () => {
        expect(describeRaidEvent("TRIGGERED", { message: "something else" }).details)
            .toBe("Join rate exceeded the threshold");
        expect(describeRaidEvent("TRIGGERED", null).details).toBe("Join rate exceeded the threshold");
    });

    it("credits the moderator on a manual trigger", () => {
        expect(describeRaidEvent("TRIGGERED", { moderator: "oud", manual: true })).toEqual({
            title: "Raid mode started",
            details: "Started manually by @oud",
            actor: "oud",
        });
    });

    it("handles a manual trigger without a moderator name", () => {
        expect(describeRaidEvent("TRIGGERED", { manual: true })).toEqual({
            title: "Raid mode started",
            details: "Started manually",
            actor: "Anti-Raid Guard",
        });
    });

    it("describes a resolve as an end, not a new raid", () => {
        expect(describeRaidEvent("RESOLVED", null)).toEqual({
            title: "Raid resolved",
            details: "Raid mode ended",
            actor: "Anti-Raid Guard",
        });
    });

    it("labels an applied mitigation", () => {
        expect(describeRaidEvent("ACTION_APPLIED", null).title).toBe("Raid mitigation applied");
    });

    it("ignores details of the wrong shape", () => {
        expect(describeRaidEvent("TRIGGERED", { manual: "yes", message: 7 }).title).toBe("Raid detected");
    });

    it("passes an unknown event type through", () => {
        expect(describeRaidEvent("SOMETHING_NEW", null)).toEqual({
            title: "Anti-Raid event",
            details: "SOMETHING_NEW",
            actor: "Anti-Raid Guard",
        });
    });
});
