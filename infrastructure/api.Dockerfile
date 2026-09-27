# The backend API. Build from the repo root:
#   docker build -f infrastructure/api.Dockerfile .
# The host sets PORT; the API reads it (defaults to 4000).
FROM node:24-slim

RUN npm install -g pnpm@10.34.5
WORKDIR /app

COPY . .
# Only what the API needs, not the frontends.
RUN pnpm install --frozen-lockfile --prod --filter "@handy/api..."

ENV NODE_ENV=production
EXPOSE 4000

CMD ["pnpm", "start"]
