# Build Stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# We need to set the env var during build time for Next.js to bake it in, 
# OR we can rely on runtime config if we were using it, but simpler here:
# We'll expect it to be passed as build-arg or just default.
# For now, let's assume standard build.
ENV NEXT_PUBLIC_API_URL=http://localhost:8000
RUN npm run build

# Production Stage
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
