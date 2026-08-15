# Dashboard Project Conventions (Next.js App Router)

## The Golden Rule: Keep it local.

If a component, server action, type, or query only belongs to **one feature** (e.g., `starboard`, `tickets`, `leveling`), it lives inside `src/features/<feature_name>/`.

Code moves to `src/features/_shared/` ONLY when **3 or more features** require the same domain logic — not just a shared type or a small helper. It is far better to duplicate a small query, schema, or component across two features than to couple them together tightly. When in doubt, keep it local. It's cheap to promote a file to `_shared/` later; it's a nightmare to untangle it once three features have imported it.

The `src/app/` folder is strictly for **ROUTING ONLY**. Page files (`page.tsx`) should be thin wrappers that import and render the feature component.

---

## 🗺️ Layout Overview

```
src/
├── app/                        # Next.js App Router ONLY (Page shells & Layouts)
│   ├── dashboard/[guild_id]/
│   │   ├── starboard/
│   │   │   ├── page.tsx        # Thin shell: renders <StarboardFeature />
│   │   │   ├── loading.tsx     # Route-level skeleton
│   │   │   └── error.tsx       # Route-level error boundary
│   │   └── leveling/
│   │       └── page.tsx        # Thin shell: renders <LevelingFeature />
│   └── layout.tsx
├── features/                   # VERTICAL SLICES — All business logic lives here!
│   ├── _shared/                 # Cross-cutting DOMAIN logic used by 3+ features
│   │   ├── index.ts            # Public API — same contract rule as any feature
│   │   ├── queries.ts          # e.g. getGuildPremiumTier(), getGuildSettings()
│   │   └── types.ts            # e.g. shared GuildConfig schema
│   └── <feature_name>/
│       ├── index.ts            # Public API (export main components/actions)
│       ├── actions.ts          # Server Actions ("use server") for this feature
│       ├── components/         # Feature-specific UI components
│       │   ├── StarboardBody.tsx
│       │   └── StarboardConfigModal.tsx
│       ├── hooks.ts            # Feature-specific client hooks (or hooks/ if 3+)
│       ├── queries.ts          # DB queries (Drizzle/Prisma/SQL) for this feature
│       └── types.ts            # Feature-specific types & Zod schemas (excl. shared req/res)
├── components/                 # GENERIC UI PRIMITIVES ONLY (No business logic!)
│   ├── ui/                     # Buttons, Inputs, Dropdowns, Modals, Sliders
│   ├── layout/                 # Sidebar, Header, Footer
│   └── feedback/               # Generic Skeleton, ErrorState — used BY route error/loading files
├── lib/                        # Cross-cutting INFRASTRUCTURE singletons only (no domain logic)
├── db.ts                   # Database connection pool setup
├── redis.ts                # Redis client setup
└── auth.ts                 # NextAuth configuration
```

**`lib/` vs `features/_shared/`:** `lib/` is for infrastructure that knows nothing about your domain — the DB client, the Redis client, auth config, a generic logger. `features/_shared/` is for domain logic that *does* know about guilds, tiers, and settings, but is needed by 3+ features. If it mentions "guild" or "starboard," it's not `lib/`.

---

## 📐 Rules for Next.js Slices

### 1. `src/app/` is for Routing, Not Logic
Your `page.tsx` file should almost never contain UI JSX beyond a layout wrapper or a loading skeleton.

```tsx
// src/app/dashboard/[guild_id]/starboard/page.tsx
import { StarboardFeature } from "@/features/starboard";

export default async function StarboardPage({ params }: { params: { guild_id: string } }) {
  return <StarboardFeature guildId={params.guild_id} />;
}
```

**Route-level `loading.tsx` / `error.tsx` / `not-found.tsx`:** These are the only "logic-adjacent" files allowed to live in `app/`, because Next.js requires it. They should be thin too — compose a generic primitive from `src/components/feedback/` (e.g., `<Skeleton />`, `<ErrorState />`) rather than hand-rolling markup per route. If a route's loading state needs to mimic a specific feature's layout (e.g., a starboard-shaped skeleton), build that skeleton component inside `features/starboard/components/` and import it into `app/.../loading.tsx` — the route file itself stays a one-line wrapper either way.

## ⚛️ React Server Components (RSC) Rules

1. **Server Components by Default:** Remember, **all components in the App Router are Server Components by default**, so please shut up and stop putting `"use client"` at the top of `page.tsx` or feature components.
2. **Push `"use client"` to the Leaves:** Only mark individual interactive components (e.g., forms, buttons with `onClick`, components using `useState`/`useEffect`) with `"use client"`. Keep wrapper layouts and container components on the server so they can fetch data directly without client-side bundle bloat.

### 2. What belongs in `src/components/`?
`src/components/` is **ONLY** for generic, reusable design-system components that know **nothing** about Discord, Guilds, or Bot Features:
* `Button.tsx`, `TextInput.tsx`, `Modal.tsx`, `Dropdown.tsx`, `Table.tsx`
* `Sidebar.tsx`, `DashboardHeader.tsx`
* `Skeleton.tsx`, `ErrorState.tsx` (generic, parameterized — not "StarboardSkeleton")

If a component mentions "Starboard", "Leveling", or "Warns", it **DOES NOT** belong in `src/components/`. It goes into `src/features/<feature_name>/components/`.

### 3. Server Actions & Queries
* Delete `src/actions/` and `src/utils/db/`.
* Server Actions for a feature live in `src/features/<feature_name>/actions.ts`.
* Raw DB queries live in `src/features/<feature_name>/queries.ts`.
* **Who calls `queries.ts`?** Feature components are allowed to be `async` Server Components and call their own `queries.ts` directly — you don't have to funnel everything through `page.tsx`. `page.tsx` should just pass down route params (`guildId`, etc.); the feature component is responsible for fetching its own data with them.

### 4. Public Facade (`features/<feature_name>/index.ts`)
Just like in Rust, every feature directory must have an `index.ts` file that acts as its public contract. Other features or pages can **only** import items exported by `index.ts`.

```typescript
// src/features/starboard/index.ts
export { StarboardFeature } from "./components/StarboardFeature";
export { updateStarboardConfig } from "./actions";
export type { StarboardConfig } from "./types";
```

**No wildcard exports.** Same rule as the Rust project — `export * from "./actions"` defeats the entire purpose of the facade. List things out explicitly.

### 5. Cross-Feature Imports
A feature may only import from another feature's `index.ts` — never reach into `features/tickets/queries.ts` from inside `starboard`. That said, treat any cross-feature import as a yellow flag, not a green light:

* If `tickets` needs one thing from `starboard` (e.g., a single type or a read-only lookup), a direct `index.ts` import is fine.
* If two features start importing from each other (A imports B, and B imports A), that's a circular dependency and a sign the shared piece needs to move to `features/_shared/` instead — or that the two "features" are actually one feature that got split too early.
* If a feature is importing 3+ things from another feature's facade, it's usually a sign the imported logic belongs in `_shared/` already, per the Golden Rule threshold.

### 6. Zod Schemas & Req/Res Types
Feature `types.ts` holds domain types and the Zod schemas for that feature's forms/config. The same schema should be reused for both client-side form validation and the corresponding Server Action's input validation — don't create a second near-identical schema in `actions.ts`. Import it from `types.ts` in both places.

Types that only exist to shape an HTTP request/response payload (not domain types) don't belong in `types.ts` — keep those inline in the route handler or action that uses them, since they're not something another part of the feature should ever import.

### 7. Hooks
Feature-specific client hooks (`useStarboardConfig`, `useTicketFilters`) live in `features/<feature_name>/hooks.ts`. If a feature accumulates 3+ distinct hooks, split into a `hooks/` folder — same threshold pattern as Redis `keys.rs` in the Rust project. Do not create a top-level `src/hooks/`; that's a layer-first folder and the same code smell as `src/actions/`.

---

## 🎨 Tailwind Theming Conventions

### 1. Design Tokens Live in `globals.css`, via `@theme`
There's no `tailwind.config.ts` on v4 — tokens are declared directly in CSS with `@theme`, which is also what generates the utility classes (`bg-surface`, `text-brand`, etc.). Never hardcode a hex/oklch value or drop into an arbitrary bracket value (`bg-[#1a1a2e]`) in a component — if a color isn't already a token, add it to `globals.css` first, then consume it.

### 2. One File, Two Blocks (Fixed Order)
`globals.css` is split into two blocks, in this order — raw palette first, `@theme` mapping second:

```css
/* src/app/globals.css */
@import "tailwindcss";

/* 1. Raw values — the actual colors */
:root {
  --surface: oklch(1 0 0);
  --surface-muted: oklch(0.96 0 0);
  --brand: oklch(0.6 0.2 264);
  --danger: oklch(0.58 0.24 27);
}

.dark {
  --surface: oklch(0.15 0 0);
  --surface-muted: oklch(0.22 0 0);
  --brand: oklch(0.68 0.2 264);
  --danger: oklch(0.65 0.24 27);
}

/* 2. Theme tokens — map raw values to Tailwind utilities */
@theme {
  --font-sans: var(--font-inter);
  --font-mono: var(--font-mono);

  --color-surface: var(--surface);
  --color-surface-muted: var(--surface-muted);
  --color-brand: var(--brand);
  --color-danger: var(--danger);
}

@custom-variant dark (&:where(.dark, .dark *));
```

They're conceptually different things, even though they live in the same file:
* `:root` / `.dark` = **the actual palette** — what "brand" *is* in each mode.
* `@theme` = **the contract** — which of those values become `bg-*` / `text-*` utilities.

**Never define a color directly inside `@theme`** (e.g. `--color-brand: oklch(0.6 0.2 264);`), even for a token that doesn't currently need a dark-mode variant. Always go through the `:root`/`.dark` indirection, so every color has exactly one predictable place to look and retheming never means hunting through `@theme` for a stray literal.

### 3. Dark Mode Is a Variable Swap, Not a Variant Sprawl
Because utilities resolve through `:root`/`.dark`, `bg-surface` just works in both modes with zero `dark:` prefixes on the component itself. Reach for the `@custom-variant dark (...)` you've already got only when light/dark needs to render genuinely different *content* (e.g. swapping an icon), not different colors of the same token.

If you later want per-guild branding, set `--brand` inline via `style={{ "--brand": guildAccentColor }}` on a wrapper — every `bg-brand`/`text-brand` in that subtree inherits it for free, no component changes required.

### 4. Where Theme Files Live
```
src/
├── app/
│   └── globals.css     # raw palette + @theme tokens + dark mode
```
Whatever you name it, it's **infrastructure** — same tier as `lib/`. It should only ever contain primitives (color/font/spacing) and never anything that mentions "guild," "starboard," or another feature concept.

### 5. Component Variants: `cva`, Not Conditional Classnames
Any component in `src/components/ui/` with more than one visual variant (a `Button` with `primary`/`danger`/`ghost`, a `Badge` with status colors) should use `class-variance-authority` rather than inline ternaries stacking `className` strings.

```tsx
// src/components/ui/Button.tsx
const buttonVariants = cva("rounded-md font-medium transition-colors", {
  variants: {
    intent: {
      primary: "bg-brand text-white hover:bg-brand/90",
      danger: "bg-danger text-white hover:bg-danger/90",
      ghost: "bg-transparent hover:bg-surface-muted",
    },
  },
  defaultVariants: { intent: "primary" },
});
```

### 6. Feature Components Consume Tokens, Never Invent Them
Feature code (`features/<feature_name>/components/`) composes existing tokens and existing `components/ui/` primitives — it never defines a new color or reaches for an arbitrary value for a one-off need. If `starboard` needs a color that doesn't exist yet, add it to `globals.css` (step 2), don't hardcode it locally. Unlike the Golden Rule's "wait for the third feature," colors/spacing should be tokenized immediately — one-off magic values are how visual drift creeps in.

### 7. `cn()` Utility
A single shared `cn()` helper (clsx + tailwind-merge) for conditionally combining classNames, so conflicting utilities (two different `bg-*` classes) resolve correctly instead of both landing in the DOM. Infrastructure, so it lives in `lib/cn.ts`.

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Here is the new section designed specifically for your conventions document!

It captures everything we built: **Zod as the single source of truth**, **honest `null` form state**, **`.superRefine()` validation**, **Server Action error boundaries**, and **Rust Serde alignment**.

You can paste this right before the `## 🚫 Code Smells` section at the bottom:


##  Form State, Zod Validation & Server Actions

### 1. Zod Is the Single Source of Truth for Types
Do not manually write `interface` definitions alongside Zod schemas. Define the Zod schema first in `features/<feature_name>/types.ts`, and infer the TypeScript type using `z.infer`.

```typescript
// src/features/tickets/types.ts
import { z } from "zod";

export const TicketConfigSchema = z.object({
  categoryId: z.string().nullish(),
  ticketRoleId: z.string().nullish(),
  enabled: z.boolean().default(false),
  warnThreshold: z.number().default(30),
});

// Automatically infer the TS type — never double-declare interfaces!
export type TicketConfig = z.infer<typeof TicketConfigSchema>;
```

### 2. Honest Form State (`null` > Magic Empty Strings)
External foreign references (e.g. Discord `categoryId`, `ticketRoleId`, `channelId`) that may be unselected during initial setup must be typed as `null` or `.nullish()`. Never use empty strings (`""`) as a fake sentinel value for `null`.

* **JSON & Server Actions:** `JSON.stringify({ categoryId: null })` preserves `null` over the wire, whereas `undefined` gets erased.
* **SQL & Rust Alignment:** `null` maps directly to Postgres `NULL` and Rust Serde `Option<T>` (`None`).

### 3. Draft Mode vs. Strict Save Validation (`.superRefine`)
Allow fields to be `null` while the user is editing or if the feature is disabled (`enabled: false`). Use Zod's `.superRefine()` on the save schema to enforce strict rules when the feature is enabled.

```typescript
// src/features/tickets/types.ts
export const SaveTicketConfigSchema = TicketConfigSchema.superRefine((data, ctx) => {
  if (data.enabled) {
    if (!data.categoryId) {
      ctx.addIssue({
        code: 'custom',
        message: "Please select a Discord Category for tickets!",
        path: ["categoryId"],
      });
    }
    if (!data.ticketRoleId) {
      ctx.addIssue({
        code: 'custom',
        message: "Please select a Support Staff Role!",
        path: ["ticketRoleId"],
      });
    }
  }
});
```

### 4. Server Action Validation & Error Throwing
Server Actions (`actions.ts`) must validate raw incoming data at the boundary using Zod before touching the database or external APIs.

To keep Server Action return signatures clean (`Promise<void>`) and easily catchable by React client hooks (`useConfigForm`), catch `z.ZodError` and re-throw the first user-friendly error message:

```typescript
// src/features/tickets/actions.ts
"use server";

import { SaveTicketConfigSchema } from "./types";
import { z } from "zod";

export async function saveTicketsConfigAction(guildId: string, rawData: unknown): Promise<void> {
  try {
    await verifyGuildAccess(guildId);

    const validatedData = SaveTicketConfigSchema.parse(rawData);

    await saveTicketConfig(guildId, validatedData);
    revalidatePath(`/dashboard/${guildId}/tickets`);
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Pick the first human-readable message to display in UI status banners
      const firstError = error.issues[0].message;
      throw new Error(firstError);
    }
    throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
  }
}
```

---

## Testing Conventions (Unit, Integration & E2E)

### 1. Colocate Feature Tests ("Keep It Local")
Just like components and queries, unit and integration tests for a feature live **inside that feature's directory** (`src/features/<feature_name>/`), not in a top-level `src/tests/` folder.

```
src/
└── features/
└── tickets/
├── actions.ts
├── actions.test.ts     # Integration tests for Server Actions
├── types.ts
├── types.test.ts       # Unit tests for complex Zod schemas
├── queries.ts
└── queries.test.ts     # DB integration tests
```

### 2. High-Yield Priority: Test Server Actions & Zod Boundary
Don't waste time testing raw React markup or standard getters. The **highest return-on-investment (ROI) tests** are integration tests on Server Actions and Zod Schemas.

* **Zod Schema Unit Tests:** Assert that valid payloads pass and invalid/malformed payloads fail with expected error messages.
* **Server Action Integration Tests:** Call Server Actions directly in Vitest/Jest (no browser required!) to verify that Zod validation, authentication (`verifyGuildAccess`), and database writes work correctly.

```typescript
// src/features/tickets/actions.test.ts
import { saveTicketsConfigAction } from "./actions";
import { vi, describe, it, expect } from "vitest";

// Mock infrastructure (DB / Auth), test real Zod + Server Action logic
vi.mock("@/features/_shared/guild", () => ({
  verifyGuildAccess: vi.fn().mockResolvedValue(true),
}));

describe("saveTicketsConfigAction", () => {
  it("should throw error when ticketing is enabled without a category", async () => {
    const invalidConfig = {
      enabled: true,
      categoryId: null, // 👈 Missing required category!
    };

    await expect(
      saveTicketsConfigAction("guild_123", invalidConfig)
    ).rejects.toThrow("Please select a Discord Category for tickets!");
  });
});
```

### 3. E2E Tests Live at Root (`e2e/`)
While feature unit/integration tests live inside `src/features/`, **End-to-End (E2E) tests** using Playwright or Cypress test multi-route user journeys (e.g. logging in via Discord, navigating sidebar, filling form, saving). E2E tests cross feature boundaries, so they live in a root-level `e2e/` folder.

```
my-dashboard/
├── e2e/                        # Playwright E2E tests (Cross-feature user flows)
│   ├── auth.spec.ts
│   └── ticketing-flow.spec.ts
├── src/
│   └── features/               # Feature-local unit/integration tests
```

### 4. Mock Infrastructure (`lib/`), Not Domain Logic
* **Mock at the edges:** Mock external network requests (`fetch` to Discord API, backend Rust bot endpoints) and infrastructure singletons (`lib/db.ts`).
* **Do NOT mock Zod or domain helpers:** Test real Zod schema parsing, real transformations, and real business logic.


## 🚫 Code Smells (What NOT to do)

* **Layer-First Directories:** Creating folders like `src/actions/`, `src/hooks/`, or `src/types/db/` containing one file per feature.
* **Smart Components in `src/components/`:** Putting domain logic (e.g., `GiveawayCreateModal.tsx`) in the generic components directory.
* **Fat Pages:** Writing 200 lines of state and JSX inside `app/dashboard/.../page.tsx`.
* **Domain logic in `lib/`:** If a file in `lib/` mentions "guild," "starboard," or any feature concept, it belongs in `_shared/` instead.
* **Premature `_shared/`:** Moving something into `_shared/` because it's used by 2 features "for now." Wait for the third.
* **Colors defined inside `@theme` directly**, skipping the :root/.dark indirection.
* **Arbitrary values in feature/component code**: `w-[137px]`, `bg-[#3b82f6]` outside truly one-off layout tweaks that will never repeat.
* **`dark`: variant sprawl**: repeating dark:bg-... dark:text-... on every element instead of letting the CSS variable swap handle it.
* **Ternary classNames instead of cva**: className={variant === "danger" ? "bg-red-500" : "bg-blue-500"} in a component with more than two variants.