# The pyENA platform as one image: the built site and the API on one port.
# Settings come from the environment at run time (see .env.example); nothing
# secret is built into the image.
#
#   docker build -t pyena-platform .
#   docker run -p 8787:8787 -e MONGODB_URI=... -e COOKIE_SECURE=true pyena-platform

# ---- Build: the site, with every dependency the build needs ----
FROM node:22-alpine AS build
WORKDIR /app
# The development database's own MongoDB download is not needed to build.
ENV MONGOMS_DISABLE_POSTINSTALL=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Run: the built site, the server, production dependencies only ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1
CMD ["node", "server/start.ts"]
