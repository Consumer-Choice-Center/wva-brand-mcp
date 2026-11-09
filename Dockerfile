# Use the same pinned Node 22 Debian base as CCC's HTTP service.
FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS dependencies
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8082
WORKDIR /app
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./package.json
COPY --chown=node:node src ./src
COPY --chown=node:node data ./data
COPY --chown=node:node assets ./assets
# The asset manifest also audits the credited real-photo regression fixture.
COPY --chown=node:node tests/fixtures ./tests/fixtures
RUN mkdir inputs deliverables && chown node:node inputs deliverables
USER node
EXPOSE 8082
CMD ["node", "src/http-server.mjs"]
