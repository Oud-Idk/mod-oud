import { describe, expect, it } from "vitest";

import {
    getAvailableRoleOptions,
    getAvailableChannelOptions,
    getAvailableCategoryOptions,
} from "./dropdown";

describe("getAvailableRoleOptions", () => {
    it("returns unmapped roles with @ prefix", () => {
        expect(
            getAvailableRoleOptions({ "1": "Admin", "2": "@mod" }, ["2"])
        ).toEqual([{ value: "1", label: "@Admin" }]);
    });

    it("handles missing maps or scopes", () => {
        expect(getAvailableRoleOptions(null)).toEqual([]);
        expect(getAvailableRoleOptions({ "1": "Admin" })).toEqual([
            { value: "1", label: "@Admin" },
        ]);
    });

    it("strips a leading at sign once", () => {
        expect(getAvailableRoleOptions({ "1": "@mod" })).toEqual([
            { value: "1", label: "@mod" },
        ]);
    });
});

describe("getAvailableChannelOptions", () => {
    it("returns unmapped channels with # prefix", () => {
        expect(
            getAvailableChannelOptions({ c1: "general", c2: "#announcements" }, ["c2"])
        ).toEqual([{ value: "c1", label: "#general" }]);
    });

    it("handles missing maps or scopes", () => {
        expect(getAvailableChannelOptions(undefined, ["x"])).toEqual([]);
    });

    it("strips a leading hash once", () => {
        expect(getAvailableChannelOptions({ c1: "#announcements" })).toEqual([
            { value: "c1", label: "#announcements" },
        ]);
    });
});

describe("getAvailableCategoryOptions", () => {
    it("returns unmapped categories unchanged", () => {
        expect(
            getAvailableCategoryOptions({ cat1: "Foo", cat2: "Bar" }, ["cat2"])
        ).toEqual([{ value: "cat1", label: "Foo" }]);
    });

    it("handles missing maps or scopes", () => {
        expect(getAvailableCategoryOptions(null)).toEqual([]);
    });
});
