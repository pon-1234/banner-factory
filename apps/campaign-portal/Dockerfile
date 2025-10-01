# syntax=docker/dockerfile:1

FROM node:20-bullseye AS deps
WORKDIR /workspace
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/campaign-portal/package.json ./apps/campaign-portal/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN npm ci

FROM node:20-bullseye AS builder
WORKDIR /workspace
COPY --from=deps /workspace/node_modules ./node_modules
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm run build --workspace @banner/shared
RUN npm run build --workspace @banner/campaign-portal
RUN npm prune --omit=dev

FROM node:20-bullseye AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/apps/campaign-portal ./apps/campaign-portal
COPY --from=builder /workspace/packages ./packages
EXPOSE 8080
CMD ["node_modules/.bin/next", "start", "apps/campaign-portal", "-p", "8080", "-H", "0.0.0.0"]
