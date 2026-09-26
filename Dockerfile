# Backend API. Works on Render, Railway, Fly, or anything else that runs a Dockerfile.
# The frontends get deployed on their own.
FROM node:24-slim

RUN npm install -g pnpm@10.34.5
WORKDIR /app

COPY . .
# Only what the API needs, not the frontends.
RUN pnpm install --frozen-lockfile --prod --filter "@handy/api..."

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

CMD ["pnpm", "start"]
