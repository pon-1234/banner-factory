FROM node:20-alpine AS builder

WORKDIR /workspace

COPY tsconfig.base.json ./tsconfig.base.json
COPY packages/shared ./packages/shared

COPY services/$svc/package*.json ./app/
COPY packages/shared ./app/packages/shared

WORKDIR /workspace/app

RUN npm install --no-package-lock

COPY services/bg-generator/tsconfig.json ./tsconfig.json
COPY services/bg-generator/src ./src

# Copy base config to the correct location
RUN cp /workspace/tsconfig.base.json ./tsconfig.base.json

RUN ./node_modules/.bin/tsc -p tsconfig.json

FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /workspace/app/package*.json ./
COPY --from=builder /workspace/app/node_modules ./node_modules
COPY --from=builder /workspace/app/dist ./dist

EXPOSE 8080

CMD ["node", "dist/server.js"]
