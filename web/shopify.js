import { BillingInterval, ApiVersion } from "@shopify/shopify-api";
import { shopifyApp } from "@shopify/shopify-app-express";
import { MongoDBSessionStorage } from "@shopify/shopify-app-session-storage-mongodb";
import { FileSessionStorage } from "./file-session-storage.js";
import { restResources } from "@shopify/shopify-api/rest/admin/2025-07";
import {
  isPlaceholderAppUrl,
  loadEnvironment,
  resolveAppUrl,
} from "./app-config.js";

loadEnvironment({ searchFromDir: process.cwd() });

export const PLAN_NAME = process.env.PLAN_NAME || "Premium plan";
export const PLAN_AMOUNT = parseFloat(process.env.PLAN_AMOUNT || "30.00");
export const PLAN_TRIAL_DAYS = parseInt(process.env.PLAN_TRIAL_DAYS || "0", 10);

// Annual plan. Billed once a year at a discount vs. 12 x the monthly price.
// Leave PLAN_NAME alone: the subscription check matches on plan name, so
// renaming it would orphan existing subscribers.
export const PLAN_ANNUAL_NAME =
  process.env.PLAN_ANNUAL_NAME || `${PLAN_NAME} annual`;
export const PLAN_ANNUAL_AMOUNT = parseFloat(
  process.env.PLAN_ANNUAL_AMOUNT || "300.00"
);

const billingConfig = {
  [PLAN_NAME]: {
    amount: PLAN_AMOUNT,
    currencyCode: "USD",
    trialDays: PLAN_TRIAL_DAYS,
    interval: BillingInterval.Every30Days,
  },
  [PLAN_ANNUAL_NAME]: {
    amount: PLAN_ANNUAL_AMOUNT,
    currencyCode: "USD",
    trialDays: PLAN_TRIAL_DAYS,
    interval: BillingInterval.Annual,
  },
};

export const appUrl = resolveAppUrl({ searchFromDir: process.cwd() });

if (
  !process.env.HOST ||
  isPlaceholderAppUrl(process.env.HOST) ||
  process.env.HOST !== appUrl
) {
  process.env.HOST = appUrl;
}

if (
  !process.env.SHOPIFY_APP_URL ||
  isPlaceholderAppUrl(process.env.SHOPIFY_APP_URL) ||
  process.env.SHOPIFY_APP_URL !== appUrl
) {
  process.env.SHOPIFY_APP_URL = appUrl;
}

const scopes = (process.env.SCOPES || "")
  .split(",")
  .map((scope) => scope.trim())
  .filter(Boolean);

const missingEnv = ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET"].filter(
  (key) => !process.env[key]
);

if (!scopes.length) {
  missingEnv.push("SCOPES");
}

if (missingEnv.length) {
  throw new Error(
    `Missing required Shopify environment variables: ${missingEnv.join(
      ", "
    )}. Copy .env.example to .env and fill them in, or run the app from the repo root with "npm run dev" so Shopify CLI can inject them.`
  );
}

function createSessionStorage() {
  if (process.env.MONGODB_URL && process.env.MONGODB_DB_NAME) {
    return new MongoDBSessionStorage(
      process.env.MONGODB_URL,
      process.env.MONGODB_DB_NAME
    );
  }

  return new FileSessionStorage();
}

const shopify = shopifyApp({
  api: {
    apiVersion: ApiVersion.July25,
    restResources,
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,
    hostName: new URL(appUrl).host,
    scopes,
    billing: billingConfig,
  },
  auth: {
    path: "/api/auth",
    callbackPath: "/api/auth/callback",
  },
  webhooks: {
    path: "/api/webhooks",
  },
  sessionStorage: createSessionStorage(),
});

// Compliance webhooks are managed via TOML/Partner Dashboard.
// Override api.webhooks.register to prevent 403 from blocking OAuth.
shopify.api.webhooks.register = async () => {
  console.log("[Webhooks] Registration skipped (managed via TOML)");
  return {};
};

export default shopify;
