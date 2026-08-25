# syntax=docker/dockerfile:1
FROM node:24-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
# Cache npm downloads across CI builds
RUN --mount=type=cache,target=/root/.npm \
    npm ci

FROM node:24-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_BACKEND_URL=http://localhost:8080
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_HCAPTCHA_SITE_KEY

ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_HCAPTCHA_SITE_KEY=$NEXT_PUBLIC_HCAPTCHA_SITE_KEY

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Cache the Next.js compilation cache
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

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