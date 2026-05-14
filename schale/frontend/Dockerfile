FROM node:25-alpine AS base
WORKDIR /app
RUN npm install -g pnpm@11.1.1

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts=false

FROM deps AS build
COPY . .
RUN pnpm build

FROM base AS runtime-deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts=false

FROM node:25-alpine AS runtime
WORKDIR /app
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321
COPY --from=build /app/dist ./dist
COPY --from=runtime-deps /app/node_modules ./node_modules
COPY package.json ./package.json
RUN chown -R appuser:appgroup /app
USER appuser
EXPOSE 4321
CMD ["node", "./dist/server/entry.mjs"]
