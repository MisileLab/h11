# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Enable corepack for yarn
RUN corepack enable

# Install dependencies
COPY package.json yarn.lock .yarnrc.yml* ./
RUN yarn install --immutable

# Copy source
COPY . .

# Build
RUN yarn build

# Production stage
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
