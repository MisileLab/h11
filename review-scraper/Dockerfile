# Build stage for frontend
FROM node:25-alpine AS frontend-build
WORKDIR /app
RUN npm install -g pnpm@10.32.1
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:25-alpine AS runtime
WORKDIR /app
RUN npm install -g pnpm@10.32.1
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile && \
    pnpm add tsx

COPY --from=frontend-build /app/dist ./dist
COPY server ./server

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000
CMD ["pnpx", "tsx", "server/index.ts"]
