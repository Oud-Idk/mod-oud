import { z } from "zod";

const gameToggleSchema = z.object({
    enabled: z.boolean().default(true),
});

export const gamblingConfigSchema = z
    .object({
        enabled: z.boolean().default(false),
        cooldownSecs: z.number().int().nonnegative().default(0),
        minBet: z.number().int().min(1).default(10),
        maxBet: z.number().int().nonnegative().default(0),
        timeoutSecs: z.number().int().min(10).max(300).default(60),
        blackjack: gameToggleSchema.default({ enabled: true }),
        coinflip: gameToggleSchema.default({ enabled: true }),
        slots: gameToggleSchema.default({ enabled: true }),
        roulette: gameToggleSchema.default({ enabled: true }),
        higherlower: gameToggleSchema.default({ enabled: true }),
    })
    .superRefine((data, ctx) => {
        if (data.maxBet !== 0 && data.maxBet < data.minBet) {
            ctx.addIssue({
                code: "custom",
                message: "Maximum bet must be 0 (no cap) or >= minimum bet.",
                path: ["maxBet"],
            });
        }
    });

export type GamblingConfig = z.infer<typeof gamblingConfigSchema>;
export type GamblingConfigInput = z.input<typeof gamblingConfigSchema>;
export type GameToggle = z.infer<typeof gameToggleSchema>;
