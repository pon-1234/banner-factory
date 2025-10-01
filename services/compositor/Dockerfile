FROM node:20-bookworm AS builder

WORKDIR /workspace

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ pkg-config \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
  && rm -rf /var/lib/apt/lists/*

COPY tsconfig.base.json ./tsconfig.base.json
COPY packages/shared ./packages/shared

COPY services/compositor/package*.json ./app/
COPY packages/shared ./app/packages/shared

WORKDIR /workspace/app

RUN npm install --no-package-lock

COPY services/compositor/tsconfig.json ./tsconfig.json
COPY services/compositor/src ./src

# Copy base config to the correct location (and root to satisfy absolute lookup)
RUN cp /workspace/tsconfig.base.json ./tsconfig.base.json && cp /workspace/tsconfig.base.json /tsconfig.base.json

# Build shared workspace first so types/dist exist
RUN ./node_modules/.bin/tsc -p packages/shared/tsconfig.json

# Ensure @banner/shared is materialized (avoid file: symlink issues in final image)
RUN rm -rf node_modules/@banner/shared \
  && mkdir -p node_modules/@banner/shared \
  && cp -r packages/shared/dist node_modules/@banner/shared/dist \
  && cp packages/shared/package.json node_modules/@banner/shared/package.json

RUN ./node_modules/.bin/tsc -p tsconfig.json

FROM node:20-bookworm

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 libpango-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /workspace/app/package*.json ./
COPY --from=builder /workspace/app/node_modules ./node_modules
COPY --from=builder /workspace/app/dist ./dist

EXPOSE 8080

CMD ["node", "dist/server.js"]
