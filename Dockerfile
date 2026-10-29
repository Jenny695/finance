FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev --ignore-scripts --offline --no-audit --no-fund

FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000 DATA_DIR=/var/data DROP_PRIVILEGES=1
WORKDIR /app
COPY package.json package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/lib ./lib
COPY --from=build /app/public ./public
COPY --from=build /app/scripts ./scripts
RUN mkdir -p /var/data && chown -R node:node /app /var/data
EXPOSE 3000
CMD ["node","server/public-server.js"]
