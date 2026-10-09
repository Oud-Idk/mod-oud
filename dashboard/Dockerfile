# syntax=docker/dockerfile:1
FROM node:24-slim AS deps
WORKDIR /app

# Corepack provides the pnpm version pinned in package.json's packageManager field
RUN corepack enable pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="/pnpm:$PATH"

# A system libvips otherwise makes sharp's install script compile from source
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Cache pnpm's store across builds
RUN --mount=type=cache,target=/root/.cache/corepack,id=modoud-corepack \
    --mount=type=cache,target=/pnpm,id=modoud-store \
    pnpm install --frozen-lockfile

FROM node:24-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV PNPM_HOME="/pnpm"
ENV PATH="/pnpm:$PATH"
RUN corepack enable pnpm

ARG NEXT_PUBLIC_BACKEND_URL=http://localhost:8080
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_HCAPTCHA_SITE_KEY

ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_HCAPTCHA_SITE_KEY=$NEXT_PUBLIC_HCAPTCHA_SITE_KEY

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Cache the Next.js compilation cache
RUN --mount=type=cache,target=/root/.cache/corepack,id=modoud-corepack \
    --mount=type=cache,target=/app/.next/cache \
    pnpm run build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Standalone output bundle only
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/love.md ./love.md

EXPOSE 3000
CMD ["node", "server.js"]