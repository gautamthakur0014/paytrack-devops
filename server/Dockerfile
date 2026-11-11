# =============================================================================
# FILE: server/Dockerfile
# OVERVIEW: Builds the PayTrack Express API image. Two stages:
#   1) "deps"    -> installs production-only npm packages (cached layer)
#   2) "runtime" -> copies deps + source into a slim image, runs as non-root.
# Used by: GitHub Actions (cd.yml) -> pushed to ECR -> run on EKS.
# =============================================================================

# Stage 1: install only production dependencies. Kept separate so the layer is
# cached unless package*.json changes (faster CI builds).
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Stage 2: final runtime image. Alpine keeps it small.
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Copy node_modules from stage 1 and then the application source code.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# The app's logger (winston-daily-rotate-file) writes to /app/logs in production,
# so the folder must exist and be writable by the non-root "node" user.
RUN mkdir -p /app/logs && chown -R node:node /app

# Drop root privileges (security best practice).
USER node

# Documented port; the real port comes from the PORT env var (default 5000).
EXPOSE 5000

# Run node directly (not "npm start") so SIGTERM reaches the app and the
# graceful-shutdown handler in src/index.js works during rolling updates.
CMD ["node", "src/index.js"]
