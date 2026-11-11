# =============================================================================
# FILE: client/Dockerfile
# OVERVIEW: Builds the React (Vite) SPA and serves the static files with nginx.
#   1) "build"   -> node: npm ci + vite build  -> /app/dist
#   2) "runtime" -> nginx: serves /app/dist using nginx.conf
# VITE_API_URL is baked in at build time. In AWS it is "" (empty) because the
# ALB routes /api/* to the backend on the SAME domain (no CORS, and ONE image
# works for every environment). For local docker-compose it is localhost:5000.
# =============================================================================

# Stage 1: compile the SPA into static HTML/JS/CSS.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# Build-time API base URL. Default empty => relative calls like /api/v1/...
# (api.js builds `${VITE_API_URL}/api/v1`, so empty works as same-origin).
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Stage 2: tiny nginx image that only contains the compiled files.
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
# The nginx base image already starts nginx in the foreground; no CMD needed.
