# For a Hugging Face Space: Docker SDK, Blank template, app_port 7860.
# Only the public GitHub source is downloaded; no local credentials or databases are uploaded.
FROM node:24-bookworm-slim AS build
WORKDIR /app
ADD https://github.com/Jenny695/finance/archive/refs/heads/main.tar.gz /tmp/finance-source.tar.gz
RUN tar -xzf /tmp/finance-source.tar.gz --strip-components=1 -C /app && rm /tmp/finance-source.tar.gz
RUN npm ci --no-audit --no-fund
RUN npm run build && npm prune --omit=dev --ignore-scripts --offline --no-audit --no-fund

FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=7860 BIND_HOST=0.0.0.0 DATA_DIR=/home/node/data DROP_PRIVILEGES=0
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/lib ./lib
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/scripts ./scripts
RUN mkdir -p /home/node/data && chown node:node /home/node/data
USER node
EXPOSE 7860
CMD ["node","server/public-server.js"]
