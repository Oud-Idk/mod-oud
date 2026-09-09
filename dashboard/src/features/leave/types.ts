import { checkMessageNotEmpty, isBlank, memberMessageConfigSchema } from "@/features/welcome/types";

export const saveLeaveConfigSchema = memberMessageConfigSchema.superRefine((data, ctx) => {
    if (data.enabled) {
        if (isBlank(data.channelId)) {
            ctx.addIssue({
                code: 'custom',
                message: "Please select a channel for leave messages.",
                path: ["channelId"],
            });
        }

        checkMessageNotEmpty(data.message, [], ctx);
    }
});

