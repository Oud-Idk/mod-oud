import { describe, expect, it, vi } from "vitest";
import { createFilterUpdater } from "./filterUpdater";
import {
    messageFilteringConfigSchema
} from "@/features/message-filtering/types";

describe("createFilterUpdater", () => {
    it("updates only targeted nested fields while preserving the rest of config", () => {
        const initialConfig = messageFilteringConfigSchema.parse({})

        const handleChange = vi.fn();
        const updateZalgo = createFilterUpdater(initialConfig, handleChange, "zalgo");

        updateZalgo({ enabled: true });

        expect(handleChange).toHaveBeenCalledTimes(1);

        const expected = structuredClone(initialConfig);
        expected.zalgo.enabled = true;
        expect(handleChange).toHaveBeenCalledWith(expected);
    });
});