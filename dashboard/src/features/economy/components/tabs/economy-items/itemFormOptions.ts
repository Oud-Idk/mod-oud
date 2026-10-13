import type { ItemAction, ItemRequirement } from "@/features/economy/types";

export const TRIGGER_OPTIONS = [
    { label: "On Buy", value: "1" },
    { label: "On Use", value: "2" },
    { label: "On Buy & Use", value: "3" },
];

export const REQ_TYPE_OPTIONS = [
    { label: "Role Requirement", value: "ROLE" },
    { label: "Total Balance Requirement", value: "TOTAL_BALANCE" },
    { label: "Item Ownership Requirement", value: "ITEM" },
];

export const MATCH_TYPE_OPTIONS = [
    { label: "Must have ALL (Every)", value: "EVERY" },
    { label: "Must have AT LEAST ONE (Any)", value: "AT_LEAST_ONE" },
    { label: "Must have NONE (Blacklist)", value: "NONE" },
];

export const ACTION_TYPE_OPTIONS = [
    { label: "Give Roles", value: "ADD_ROLES" },
    { label: "Remove Roles", value: "REMOVE_ROLES" },
    { label: "Add Coins", value: "ADD_BALANCE" },
    { label: "Deduct Coins", value: "REMOVE_BALANCE" },
    { label: "Send Response Message", value: "RESPOND" },
    { label: "Give Items", value: "ADD_ITEMS" },
    { label: "Remove Items", value: "REMOVE_ITEMS" },
];

export function parseReqType(val: string | null | undefined): ItemRequirement["type"] {
    if (val === "TOTAL_BALANCE" || val === "ITEM") return val;
    return "ROLE";
}

export function parseMatchType(val: string | null | undefined): "EVERY" | "AT_LEAST_ONE" | "NONE" {
    if (val === "AT_LEAST_ONE" || val === "NONE") return val;
    return "EVERY";
}

export function parseActionType(val: string | null | undefined): ItemAction["type"] {
    if (
        val === "RESPOND" ||
        val === "REMOVE_ROLES" ||
        val === "ADD_BALANCE" ||
        val === "REMOVE_BALANCE" ||
        val === "ADD_ITEMS" ||
        val === "REMOVE_ITEMS"
    ) {
        return val;
    }
    return "ADD_ROLES";
}

export function getRequirementMatchType(req: ItemRequirement): string {
    if (req.type === "ROLE" || req.type === "ITEM") return req.matchType;
    return "EVERY";
}
