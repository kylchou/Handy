import path from "node:path";
import { config as loadEnv } from "dotenv";
import { findRepoRoot } from "@handy/db";

export interface AppConfig {
  port: number;
  host: string;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  corsOrigins: string[];
  timezone: string;
  seedOnStart: boolean;
  matchInitialOffers: number;
  matchExpandAfterSeconds: number;
  matchOfferTtlSeconds: number;
  platformFeeCents: number;
  allowDemoReset: boolean;
  aiServiceModule: string;
  matchingServiceModule: string;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  loadEnv({ path: path.join(findRepoRoot(), ".env"), quiet: true });
  const env = process.env;
  const cfg: AppConfig = {
    port: Number(env.API_PORT ?? 4000),
    host: env.API_HOST ?? "0.0.0.0",
    databaseUrl: env.DATABASE_URL ?? "pglite://.data/handy",
    jwtSecret: env.JWT_SECRET ?? "dev-only-change-me",
    jwtExpiresIn: env.JWT_EXPIRES_IN ?? "7d",
    corsOrigins: (env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3001,http://localhost:3002")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    timezone: env.APP_TIMEZONE ?? "America/New_York",
    seedOnStart: (env.SEED_ON_START ?? "true") === "true",
    matchInitialOffers: Number(env.MATCH_INITIAL_OFFERS ?? 5),
    matchExpandAfterSeconds: Number(env.MATCH_EXPAND_AFTER_SECONDS ?? 120),
    matchOfferTtlSeconds: Number(env.MATCH_OFFER_TTL_SECONDS ?? 300),
    platformFeeCents: Number(env.PLATFORM_FEE_CENTS ?? 500),
    allowDemoReset: (env.ALLOW_DEMO_RESET ?? (env.NODE_ENV === "production" ? "false" : "true")) === "true",
    aiServiceModule: env.AI_SERVICE_MODULE ?? "@handy/ai",
    matchingServiceModule: env.MATCHING_SERVICE_MODULE ?? "@handy/matching",
    ...overrides,
  };
  if (process.env.NODE_ENV === "production" && cfg.jwtSecret === "dev-only-change-me") {
    throw new Error("JWT_SECRET must be set in production.");
  }
  return cfg;
}
