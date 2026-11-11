# Game server image for Boxity Legion. Build from the repo root (the server imports
# the rules in ../shared):
#   docker build -f server/Dockerfile -t my-game-server .
FROM node:22-slim
WORKDIR /app

COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev --legacy-peer-deps

COPY server/src server/src
COPY shared shared

# Legion sets PORT (2567); NODE_ENV, CLIENT_ORIGIN, MONGODB_URI and BLOXITY_* are
# injected at deploy time. Run as a non-root user.
ENV NODE_ENV=production PORT=2567
RUN chown -R node:node /app
USER node
WORKDIR /app/server
EXPOSE 2567
CMD ["node", "src/index.js"]
