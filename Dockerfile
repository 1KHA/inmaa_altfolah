# ---------------------------------------------------------------------------
# Stage 1 — deps: install node_modules once, cached until package.json changes
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------------------------------------------------------------------------
# Stage 2 — builder: generate the Prisma client and build Next.js
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle AT BUILD TIME.
# Changing them later requires rebuilding the image (see DEPLOYMENT.md).
ARG NEXT_PUBLIC_REGISTRATION_CLOSED=false
ARG NEXT_PUBLIC_SUPABASE_URL=
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=

# The build never talks to a real database, but prisma/schema.prisma requires
# DATABASE_URL/DIRECT_URL to be set for `prisma generate`, so use placeholders.
ENV NEXT_PUBLIC_REGISTRATION_CLOSED=$NEXT_PUBLIC_REGISTRATION_CLOSED \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    DATABASE_TYPE=postgresql \
    DATABASE_URL=postgresql://build:build@localhost:5432/build \
    DIRECT_URL=postgresql://build:build@localhost:5432/build \
    NEXT_TELEMETRY_DISABLED=1

RUN npx prisma generate && npx next build

# ---------------------------------------------------------------------------
# Stage 3 — runner: minimal production image
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001 -G nodejs

# Next.js standalone server (includes only the node_modules the server needs)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma schema + migrations + seed, and the Prisma CLI so the container can
# run `migrate deploy` on startup (entrypoint.sh)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
# transitive dep of the Prisma CLI (@prisma/config), not traced by standalone
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/jiti ./node_modules/jiti
# needed by prisma/seed.js (Next bundles it into server chunks, so the
# standalone node_modules doesn't carry it)
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/bcryptjs ./node_modules/bcryptjs
# Generated client (query engine binary) — must win over the deps copy above
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client

COPY --chown=nextjs:nodejs docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/login || exit 1

ENTRYPOINT ["./entrypoint.sh"]
