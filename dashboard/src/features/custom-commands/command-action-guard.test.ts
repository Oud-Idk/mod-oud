import { describe, it, expect } from "vitest";

// Dynamic import, so a mutant that breaks module load fails here
// instead of hiding as a collection error in every other file.
describe("commandActionSchema module guard", () => {
    it("should load with a working type discriminator", async () => {
        const mod = await import("./types");
        const layout = { messages: [{ format: "TEXT", content: "hi" }] };
        expect(
            mod.commandActionSchema.safeParse({
                type: "send_channel_message",
                data: { channel_id: "chan_1", message_layout: layout },
            }).success
        ).toBe(true);
        expect(
            mod.commandActionSchema.safeParse({
                type: "respond_current_channel",
                data: { message_layout: layout },
            }).success
        ).toBe(true);
        expect(
            mod.commandActionSchema.safeParse({ type: "add_role", data: { role_id: "role_1" } })
                .success
        ).toBe(true);
        expect(
            mod.commandActionSchema.safeParse({ type: "remove_role", data: { role_id: "role_1" } })
                .success
        ).toBe(true);
        expect(mod.commandActionSchema.safeParse({}).success).toBe(false);
        expect(mod.commandActionSchema.safeParse({ type: "delete_everything", data: {} }).success).toBe(
            false
        );
    });
});
