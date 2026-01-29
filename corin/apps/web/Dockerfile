FROM node:20-alpine AS deps

WORKDIR /app
COPY web/package.json web/yarn.lock ./
RUN corepack enable \
  && yarn config set nodeLinker node-modules \
  && yarn install --frozen-lockfile

FROM node:20-alpine AS build

WORKDIR /app
RUN corepack enable
ENV YARN_NODE_LINKER=node-modules
COPY --from=deps /app/.yarnrc.yml ./.yarnrc.yml
COPY --from=deps /app/node_modules ./node_modules
COPY web ./
RUN yarn build

FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

COPY web/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server.js"]
