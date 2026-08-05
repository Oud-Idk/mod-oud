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

## 🚫 Code Smells (What NOT to do)

* **Layer-First Directories:** Creating folders like `src/actions/`, `src/hooks/`, or `src/types/db/` containing one file per feature.
* **Smart Components in `src/components/`:** Putting domain logic (e.g., `GiveawayCreateModal.tsx`) in the generic components directory.
* **Fat Pages:** Writing 200 lines of state and JSX inside `app/dashboard/.../page.tsx`.
* **Domain logic in `lib/`:** If a file in `lib/` mentions "guild," "starboard," or any feature concept, it belongs in `_shared/` instead.
* **Premature `_shared/`:** Moving something into `_shared/` because it's used by 2 features "for now." Wait for the third.

