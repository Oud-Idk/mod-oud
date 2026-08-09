import { describe, it, expect } from "vitest";
import {
    simpleReportActionSchema,
    reportActionSchema,
    timeUnitSchema,
    reportedMessageSchema,
    reportConfigSchema,
    DEFAULT_REPORT_DM_MESSAGE,
} from "./types";

describe("simpleReportActionSchema", () => {
    it("should accept ACTIONED and DISMISSED", () => {
        expect(simpleReportActionSchema.safeParse("ACTIONED").success).toBe(true);
        expect(simpleReportActionSchema.safeParse("DISMISSED").success).toBe(true);
    });

    it("should REJECT UNDER_REVIEW", () => {
        expect(simpleReportActionSchema.safeParse("UNDER_REVIEW").success).toBe(false);
    });
});

describe("reportActionSchema", () => {
    it("should accept all three statuses", () => {
        expect(reportActionSchema.safeParse("UNDER_REVIEW").success).toBe(true);
        expect(reportActionSchema.safeParse("ACTIONED").success).toBe(true);
        expect(reportActionSchema.safeParse("DISMISSED").success).toBe(true);
    });

    it("should REJECT an unknown status", () => {
        expect(reportActionSchema.safeParse("RESOLVED").success).toBe(false);
    });
});

describe("timeUnitSchema", () => {
    it("should accept all three units", () => {
        expect(timeUnitSchema.safeParse("MINUTES").success).toBe(true);
        expect(timeUnitSchema.safeParse("HOURS").success).toBe(true);
        expect(timeUnitSchema.safeParse("DAYS").success).toBe(true);
    });
});

describe("reportedMessageSchema", () => {
    it("should coerce the id and apply defaults", () => {
        const parsed = reportedMessageSchema.parse({
            id: "42",
            guild_id: "guild_123",
            channel_id: "chan_1",
            message_id: "msg_1",
            author_id: "user_1",
            reporter_id: "user_2",
            created_at: "2026-01-01T00:00:00.000Z",
        });

        expect(parsed.id).toBe(42);
        expect(parsed.status).toBe("UNDER_REVIEW");
        expect(parsed.content).toBe("");
        expect(parsed.reason).toBe("");
        expect(parsed.attachment_url).toBeNull();
        expect(parsed.moderator_id).toBeNull();
        expect(parsed.moderator_notes).toBeNull();
        expect(parsed.resolved_at).toBeNull();
        expect(parsed.message_deleted).toBe(false);
        expect(parsed.user_warned).toBe(false);
        expect(parsed.user_timed_out).toBe(false);
        expect(parsed.user_banned).toBe(false);
    });

    it("should keep provided values", () => {
        const parsed = reportedMessageSchema.parse({
            id: 1,
            guild_id: "guild_123",
            channel_id: "chan_1",
            message_id: "msg_1",
            author_id: "user_1",
            reporter_id: "user_2",
            content: "spam",
            reason: "Spam",
            status: "ACTIONED",
            moderator_id: "user_3",
            moderator_notes: "Resolved",
            created_at: "2026-01-01T00:00:00.000Z",
            resolved_at: "2026-01-02T00:00:00.000Z",
            message_deleted: true,
            user_warned: true,
        });

        expect(parsed.status).toBe("ACTIONED");
        expect(parsed.moderator_notes).toBe("Resolved");
        expect(parsed.user_warned).toBe(true);
    });

    it("should REJECT a missing message_id", () => {
        const result = reportedMessageSchema.safeParse({
            id: 1,
            guild_id: "guild_123",
            channel_id: "chan_1",
            author_id: "user_1",
            reporter_id: "user_2",
            created_at: "2026-01-01T00:00:00.000Z",
        });

        expect(result.success).toBe(false);
    });
});

describe("reportConfigSchema", () => {
    it("should apply defaults for an empty object", () => {
        const parsed = reportConfigSchema.parse({});

        expect(parsed.enabled).toBe(false);
        expect(parsed.reportingChannel).toBeNull();
        expect(parsed.resolvedDm).toEqual(DEFAULT_REPORT_DM_MESSAGE);
        expect(parsed.dismissedDm).toEqual(DEFAULT_REPORT_DM_MESSAGE);
    });

    it("should keep provided values", () => {
        const parsed = reportConfigSchema.parse({
            enabled: true,
            reportingChannel: "chan_1",
        });

        expect(parsed.enabled).toBe(true);
        expect(parsed.reportingChannel).toBe("chan_1");
    });

    it("should REJECT a non-boolean enabled value", () => {
        expect(reportConfigSchema.safeParse({ enabled: "yes" }).success).toBe(false);
    });
});
