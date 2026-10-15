import { describe, expect, it } from "vitest";
import { itemRequirementSchema } from "@/features/economy/types";

import {
    TRIGGER_OPTIONS,
    REQ_TYPE_OPTIONS,
    MATCH_TYPE_OPTIONS,
    ACTION_TYPE_OPTIONS,
    parseReqType,
    parseMatchType,
    parseActionType,
    getRequirementMatchType,
} from "./itemFormOptions";

describe("parseReqType", () => {
    it("returns the valid types unchanged", () => {
        expect(parseReqType("TOTAL_BALANCE")).toBe("TOTAL_BALANCE");
        expect(parseReqType("ITEM")).toBe("ITEM");
    });

    it("defaults to ROLE for anything else", () => {
        expect(parseReqType("ROLE")).toBe("ROLE");
        expect(parseReqType(undefined)).toBe("ROLE");
        expect(parseReqType(null)).toBe("ROLE");
        expect(parseReqType("NOPE")).toBe("ROLE");
    });
});

describe("parseMatchType", () => {
    it("returns the valid types unchanged", () => {
        expect(parseMatchType("AT_LEAST_ONE")).toBe("AT_LEAST_ONE");
        expect(parseMatchType("NONE")).toBe("NONE");
    });

    it("defaults to EVERY for anything else", () => {
        expect(parseMatchType("EVERY")).toBe("EVERY");
        expect(parseMatchType(undefined)).toBe("EVERY");
        expect(parseMatchType(null)).toBe("EVERY");
        expect(parseMatchType("NOPE")).toBe("EVERY");
    });
});

describe("parseActionType", () => {
    it("returns each valid type unchanged", () => {
        expect(parseActionType("RESPOND")).toBe("RESPOND");
        expect(parseActionType("REMOVE_ROLES")).toBe("REMOVE_ROLES");
        expect(parseActionType("ADD_BALANCE")).toBe("ADD_BALANCE");
        expect(parseActionType("REMOVE_BALANCE")).toBe("REMOVE_BALANCE");
        expect(parseActionType("ADD_ITEMS")).toBe("ADD_ITEMS");
        expect(parseActionType("REMOVE_ITEMS")).toBe("REMOVE_ITEMS");
    });

    it("defaults to ADD_ROLES for anything else", () => {
        expect(parseActionType("ADD_ROLES")).toBe("ADD_ROLES");
        expect(parseActionType(undefined)).toBe("ADD_ROLES");
        expect(parseActionType(null)).toBe("ADD_ROLES");
        expect(parseActionType("NOPE")).toBe("ADD_ROLES");
    });
});

describe("getRequirementMatchType", () => {
    it("returns matchType for role and item requirements", () => {
        expect(
            getRequirementMatchType(itemRequirementSchema.parse({ type: "ROLE", matchType: "NONE", triggerFlags: 1, roleIds: [] }))
        ).toBe("NONE");
        expect(
            getRequirementMatchType(itemRequirementSchema.parse({ type: "ITEM", matchType: "AT_LEAST_ONE", triggerFlags: 1, quantities: {} }))
        ).toBe("AT_LEAST_ONE");
    });

    it("defaults to EVERY for other requirement types", () => {
        expect(
            getRequirementMatchType(itemRequirementSchema.parse({ type: "TOTAL_BALANCE", triggerFlags: 1, balance: 0 }))
        ).toBe("EVERY");
    });
});

describe("option arrays", () => {
    it("exports the expected trigger options", () => {
        expect(TRIGGER_OPTIONS).toEqual([
            { label: "On Buy", value: "1" },
            { label: "On Use", value: "2" },
            { label: "On Buy & Use", value: "3" },
        ]);
    });

    it("exports the expected requirement type options", () => {
        expect(REQ_TYPE_OPTIONS).toEqual([
            { label: "Role Requirement", value: "ROLE" },
            { label: "Total Balance Requirement", value: "TOTAL_BALANCE" },
            { label: "Item Ownership Requirement", value: "ITEM" },
        ]);
    });

    it("exports the expected match type options", () => {
        expect(MATCH_TYPE_OPTIONS).toEqual([
            { label: "Must have ALL (Every)", value: "EVERY" },
            { label: "Must have AT LEAST ONE (Any)", value: "AT_LEAST_ONE" },
            { label: "Must have NONE (Blacklist)", value: "NONE" },
        ]);
    });

    it("exports the expected action type options", () => {
        expect(ACTION_TYPE_OPTIONS).toEqual([
            { label: "Give Roles", value: "ADD_ROLES" },
            { label: "Remove Roles", value: "REMOVE_ROLES" },
            { label: "Add Coins", value: "ADD_BALANCE" },
            { label: "Deduct Coins", value: "REMOVE_BALANCE" },
            { label: "Send Response Message", value: "RESPOND" },
            { label: "Give Items", value: "ADD_ITEMS" },
            { label: "Remove Items", value: "REMOVE_ITEMS" },
        ]);
    });
});
