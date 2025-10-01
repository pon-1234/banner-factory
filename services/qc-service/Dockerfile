FROM node:20-alpine AS builder

WORKDIR /workspace

COPY tsconfig.base.json ./tsconfig.base.json
COPY packages/shared ./packages/shared

COPY services/qc-service/package*.json ./app/
COPY packages/shared ./app/packages/shared

WORKDIR /workspace/app

RUN npm install --no-package-lock

COPY services/qc-service/tsconfig.json ./tsconfig.json
COPY services/qc-service/src ./src

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

FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /workspace/app/package*.json ./
COPY --from=builder /workspace/app/node_modules ./node_modules
COPY --from=builder /workspace/app/dist ./dist

EXPOSE 8080

CMD ["node", "dist/server.js"]
