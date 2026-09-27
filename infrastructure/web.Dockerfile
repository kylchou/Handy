# The customer, worker, and admin apps. Build from the repo root, picking the app:
#   docker build -f infrastructure/web.Dockerfile --build-arg APP=customer --build-arg NEXT_PUBLIC_API_URL=https://your-api .
# NEXT_PUBLIC_API_URL gets baked in at build time, so rebuild if the API's address changes.
FROM node:24-slim

RUN npm install -g pnpm@10.34.5
WORKDIR /app

ARG APP=customer
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .
RUN pnpm install --frozen-lockfile --filter "@handy/${APP}..."
RUN pnpm --filter "@handy/${APP}" build

ENV NODE_ENV=production
ENV APP=$APP
EXPOSE 3000

# next start uses the PORT the host gives it.
CMD ["sh", "-c", "pnpm --filter @handy/$APP start"]
