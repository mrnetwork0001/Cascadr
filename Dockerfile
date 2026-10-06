# Cascadr frontend - Next.js 14, standalone output.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The browser only ever calls same-origin /api; next.config.mjs rewrites it to
# BACKEND_URL on the server side, so an internal hostname works here. The
# rewrite is compiled at build time.
ARG BACKEND_URL=http://backend:8010
ENV BACKEND_URL=$BACKEND_URL
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 4010
ENV PORT=4010 HOSTNAME=0.0.0.0
# The landing page is rendered on the server from live API data.
ENV BACKEND_INTERNAL_URL=http://backend:8010
CMD ["node", "server.js"]
