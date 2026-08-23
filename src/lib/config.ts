import { env } from "cloudflare:workers";

export function cfg() {
  const e = env as Record<string, any>;
  return {
    DB: e.DB,
    SITE_URL: e.SITE_URL || "https://boykingtut.com",
    GOOGLE_CLIENT_ID: e.GOOGLE_CLIENT_ID || "",
    GOOGLE_CLIENT_SECRET: e.GOOGLE_CLIENT_SECRET || "",
    ADMIN_EMAILS: e.ADMIN_EMAILS || "",
    DISCORD_WEBHOOK_URL: e.DISCORD_WEBHOOK_URL || "",
    DISCORD_INVITE_URL: e.DISCORD_INVITE_URL || "https://discord.gg/HA73BUfJ67",
    SOLANA_RECEIVING_WALLET: e.SOLANA_RECEIVING_WALLET || "4j4Rz7WHPHLdWm36db7d3LWexd3XtdPC4BxBiQ3jYmxS",
    SOLANA_RPC_URL: e.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
    COINGECKO_API_KEY: e.COINGECKO_API_KEY || "",
    CRON_SECRET: e.CRON_SECRET || ""
  };
}

export function requireDB() {
  const db = cfg().DB;
  if (!db) throw new Error("Cloudflare D1 binding 'DB' is not configured.");
  return db;
}
