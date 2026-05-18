import { join } from "path";
import { readFileSync } from "fs";
import { webcrypto } from "crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
import crypto from "crypto";
import express from "express";
import serveStatic from "serve-static";

import shopify, { PLAN_NAME, PLAN_AMOUNT, PLAN_TRIAL_DAYS } from "./shopify.js";
import productCreator from "./product-creator.js";
import cancelSubscription from "./cancel-subscription.js";
import GDPRWebhookHandlers from "./gdpr.js";
import dotenv from "dotenv";

dotenv.config();

const PORT = parseInt(
  process.env.BACKEND_PORT || process.env.PORT || "3000",
  10
);

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`;

const app = express();

function normalizeOAuthUserAgent(req, _res, next) {
  const originalUserAgent = req.headers["user-agent"] || req.headers["User-Agent"];

  if (!originalUserAgent || /bot|crawl|spider|lighthouse|scan|headless/i.test(originalUserAgent)) {
    req.headers["user-agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";
    req.headers["User-Agent"] = req.headers["user-agent"];
    console.log("[Auth] Normalized OAuth user agent:", originalUserAgent || "<missing>");
  }

  next();
}

/* ---------------------- Shopify Auth & Webhooks ---------------------- */

app.get(shopify.config.auth.path, normalizeOAuthUserAgent, shopify.auth.begin());

app.get(
  shopify.config.auth.callbackPath,
  normalizeOAuthUserAgent,
  shopify.auth.callback(),
  async (req, res, next) => {
    const session = res.locals.shopify?.session;
    if (session?.accessToken) {
      try {
        const { session: expiring } = await shopify.api.auth.migrateToExpiringToken({
          shop: session.shop,
          nonExpiringOfflineAccessToken: session.accessToken,
        });
        await shopify.config.sessionStorage.storeSession(expiring);
        res.locals.shopify.session = expiring;
        console.log("[Auth] Migrated to expiring token for:", session.shop);
      } catch (err) {
        console.error("[Auth] Token migration failed (non-fatal):", err?.message);
      }
    }
    next();
  },
  shopify.redirectToShopifyOrAppRoot()
);

console.log("[Startup] webhooks path:", shopify.config.webhooks.path);

app.get("/exitiframe", (req, res) => {
  const redirectUri = String(req.query.redirectUri || "");

  if (!redirectUri) {
    return res.status(400).send("Missing redirectUri");
  }

  let target;

  try {
    target = new URL(redirectUri);
  } catch {
    return res.status(400).send("Invalid redirectUri");
  }

  if (target.origin !== process.env.SHOPIFY_APP_URL) {
    return res.status(400).send("Invalid redirect target");
  }

  return res
    .status(200)
    .type("html")
    .send(`<!doctype html><html><body><script>window.top.location.replace(${JSON.stringify(
      redirectUri
    )});</script></body></html>`);
});

app.post(
  "/api/webhooks",
  express.text({ type: "*/*" }),
  async (req, res) => {
    const hmacHeader = req.headers["x-shopify-hmac-sha256"];
    const secretUsed = process.env.SHOPIFY_API_SECRET;
    console.log("[Webhook] body type:", typeof req.body, "| length:", req.body?.length);
    console.log("[Webhook] body repr:", JSON.stringify(req.body));
    console.log("[Webhook] hmac header:", hmacHeader);
    console.log("[Webhook] secret length:", secretUsed?.length, "| first15:", secretUsed?.slice(0,15));
    console.log("[Webhook] secret hex:", Buffer.from(secretUsed ?? "", "utf8").toString("hex").slice(0, 40));
    console.log("[Webhook] body hex:", Buffer.from(req.body, "utf8").toString("hex"));

    if (!hmacHeader) {
      return res.status(400).send();
    }

    const generatedHash = crypto
      .createHmac("sha256", process.env.SHOPIFY_API_SECRET)
      .update(req.body, "utf8")
      .digest("base64");
    console.log("[Webhook] computed hash:", generatedHash);

    let valid = false;
    try {
      valid = crypto.timingSafeEqual(
        Buffer.from(generatedHash, "base64"),
        Buffer.from(hmacHeader, "base64")
      );
    } catch {
      return res.status(400).send();
    }

    if (!valid) {
      return res.status(401).send();
    }

    res.status(200).send();

    const topic = String(req.headers["x-shopify-topic"] ?? "")
      .toUpperCase()
      .replace(/\//g, "_");
    const shop = req.headers["x-shopify-shop-domain"];
    const webhookId = req.headers["x-shopify-webhook-id"];

    const handler = GDPRWebhookHandlers[topic];
    if (handler?.callback) {
      handler.callback(topic, shop, req.body, webhookId).catch((err) =>
        console.error(`[Webhook] ${topic} handler error:`, err)
      );
    }
  }
);

app.use("/api/*", async (req, res, next) => {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    let shop = req.query.shop || "";

    if (token) {
      try {
        const payload = await shopify.api.session.decodeSessionToken(token);
        shop = (payload.dest || "").replace("https://", "");
      } catch {
        const raw = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
        shop = (raw.dest || "").replace("https://", "");
      }
    }

    if (!shop) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const sessionId = shopify.api.session.getOfflineId(shop);
    const session = await shopify.config.sessionStorage.loadSession(sessionId);

    if (!session) {
      console.log("[Auth] No session found for shop, requesting reauth:", shop);
      res.set("X-Shopify-API-Request-Failure-Reauthorize", "1");
      res.set("X-Shopify-API-Request-Failure-Reauthorize-Url", `/api/auth?shop=${shop}`);
      return res.status(401).json({ error: "Reauthorization required" });
    }

    res.locals.shopify = { ...res.locals.shopify, session };
    return next();
  } catch (err) {
    console.error("[Auth] Middleware error:", err?.message);
    return res.status(500).json({ error: "Auth error" });
  }
});

app.use(express.json());

/* ---------------------- Constants ---------------------- */

const PREMIUM_PLAN = PLAN_NAME;
const MEROXIO = "meroxio";
const PREMIUM_PLAN_KEY = "comparison_premium";
const IS_TEST = false;

/* ---------------------- Utility Functions ---------------------- */

function getSession(res) {
  return res.locals.shopify.session;
}

function getGraphQLClient(session) {
  return new shopify.api.clients.Graphql({ session });
}

async function checkSubscription(session) {
  const client = getGraphQLClient(session);
  try {
    const result = await client.request(`
      query {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            test
            status
          }
        }
      }
    `);
    const subs = result?.data?.currentAppInstallation?.activeSubscriptions ?? [];
    return subs.some(s => s.status === "ACTIVE" && (IS_TEST ? true : !s.test) && s.name === PREMIUM_PLAN);
  } catch (err) {
    if (err?.response?.code === 401 || err?.message?.includes("401")) {
      console.log("[Auth] 401 on GraphQL, deleting stale session for:", session.shop);
      const sessionId = shopify.api.session.getOfflineId(session.shop);
      await shopify.config.sessionStorage.deleteSession(sessionId);
    }
    throw err;
  }
}

async function requestSubscription(session) {
  const client = getGraphQLClient(session);
  const appUrl = process.env.SHOPIFY_APP_URL || process.env.HOST;
  const returnUrl = `${appUrl}?shop=${session.shop}&host=${Buffer.from(`${session.shop}/admin`).toString("base64")}`;
  const result = await client.request(`
    mutation AppSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean, $trialDays: Int) {
      appSubscriptionCreate(name: $name, lineItems: $lineItems, returnUrl: $returnUrl, test: $test, trialDays: $trialDays) {
        confirmationUrl
        userErrors { field message }
      }
    }
  `, {
    variables: {
      name: PREMIUM_PLAN,
      returnUrl,
      test: IS_TEST,
      trialDays: PLAN_TRIAL_DAYS > 0 ? PLAN_TRIAL_DAYS : null,
      lineItems: [{
        plan: {
          appRecurringPricingDetails: {
            price: { amount: PLAN_AMOUNT, currencyCode: "USD" },
            interval: "EVERY_30_DAYS",
          }
        }
      }]
    }
  });
  console.log("[Billing] createSubscription result:", JSON.stringify(result?.data));
  const errors = result?.data?.appSubscriptionCreate?.userErrors;
  if (errors?.length) throw new Error(errors.map(e => e.message).join(", "));
  return result?.data?.appSubscriptionCreate?.confirmationUrl;
}

/* ---------------------- Metafield Helpers ---------------------- */

async function fetchInstallation(session) {
  const client = getGraphQLClient(session);

  const result = await client.request(CURRENT_APP_INSTALLATION, {
    variables: { namespace: MEROXIO, key: PREMIUM_PLAN_KEY },
  });

  return result.data.currentAppInstallation;
}

async function createPremiumMetafield(session, ownerId) {
  const client = getGraphQLClient(session);

  return await client.request(CREATE_APP_DATA_METAFIELD, {
    variables: {
      metafieldsSetInput: [
        {
          namespace: MEROXIO,
          key: PREMIUM_PLAN_KEY,
          type: "boolean",
          value: "true",
          ownerId,
        },
      ],
    },
  });
}

async function deletePremiumMetafield(session, ownerId) {
  const client = getGraphQLClient(session);

  return await client.request(CREATE_APP_DATA_METAFIELD, {
    variables: {
      metafieldsSetInput: [
        {
          namespace: MEROXIO,
          key: PREMIUM_PLAN_KEY,
          type: "boolean",
          value: "false",
          ownerId,
        },
      ],
    },
  });
}

/* ---------------------- Subscription Routes ---------------------- */

app.get("/api/createSubscription", async (req, res) => {
  try {
    const session = getSession(res);

    const hasPayment = await checkSubscription(session);

    if (hasPayment) {
      console.log("Already active subscription");

      return res.send({
        isActiveSubscription: true,
      });
    }

    console.log("[Billing] Requesting plan:", PREMIUM_PLAN, "isTest:", IS_TEST, "amount:", PLAN_AMOUNT);
    const confirmationUrl = await requestSubscription(session);

    console.log("Redirect URL:", confirmationUrl);

    res.send({
      isActiveSubscription: false,
      confirmationUrl,
    });
  } catch (error) {
    console.error("Failed to create subscription:", error?.message, error?.response?.code, JSON.stringify(error?.response?.body));

    res.status(500).send({
      error: "Failed to create subscription",
    });
  }
});

/* ---------------------- Cancel Subscription ---------------------- */

app.get("/api/cancelSubscription", async (req, res) => {
  try {
    const session = getSession(res);

    const hasPayment = await checkSubscription(session);

    if (!hasPayment) {
      console.log("No active subscription found.");

      return res.send({
        status: "No subscription found",
      });
    }

    console.log("Active subscription found. Cancelling...");

    const subscriptionStatus = await cancelSubscription(session);

    const installation = await fetchInstallation(session);

    if (installation.metafield) {
      console.log("Clearing premium metafield for:", session.shop);

      await deletePremiumMetafield(session, installation.id);

      console.log("Premium metafield cleared for:", session.shop);
    }

    res.send({
      status: subscriptionStatus,
    });
  } catch (error) {
    console.error("Failed to cancel subscription:", error);

    res.status(500).send({
      error: "Failed to cancel subscription",
    });
  }
});

/* ---------------------- Check Active Subscription ---------------------- */

app.get("/api/hasActiveSubscription", async (req, res) => {
  try {
    const session = getSession(res);
    console.log("[Session] shop:", session?.shop, "hasToken:", !!session?.accessToken, "tokenPrefix:", session?.accessToken?.slice(0,10));

    const hasPayment = await checkSubscription(session);

    if (!hasPayment) {
      return res.send({
        hasActiveSubscription: false,
      });
    }

    console.log("Active subscription found");

    const installation = await fetchInstallation(session);

    const ownerId = installation.id;

    if (!installation.metafield) {
      await createPremiumMetafield(session, ownerId);

      console.log(
        "Metafield for premium plan created successfully:",
        session.shop
      );
    }

    res.send({
      hasActiveSubscription: true,
    });
  } catch (error) {
    console.error("Failed to fetch subscription:", error);

    res.status(500).send({
      error: "Failed to fetch subscription",
    });
  }
});




/* ---------------------- Get Shop ---------------------- */

app.get("/api/getshop", async (req, res) => {
  try {
    const session = getSession(res);

    res.send({
      shop: session?.shop,
    });
  } catch (error) {
    console.error("Failed to get shop:", error);

    res.status(500).send({
      error: "Failed to get shop",
    });
  }
});

/* ---------------------- Plan Info ---------------------- */

app.get("/api/plan-info", (_req, res) => {
  res.json({
    name: PLAN_NAME,
    amount: PLAN_AMOUNT,
    trialDays: PLAN_TRIAL_DAYS,
    interval: "MONTHLY",
    currency: "USD",
  });
});

/* ---------------------- Static & CSP ---------------------- */

app.use((err, req, res, next) => {
  console.error("[Express error]", err);
  if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
});

app.use(shopify.cspHeaders());

app.get("/", (req, res, next) => {
  const shop = typeof req.query.shop === "string" ? req.query.shop : "";
  const host = typeof req.query.host === "string" ? req.query.host : "";
  const embedded = typeof req.query.embedded === "string" ? req.query.embedded : "";

  if (!shop) {
    return next();
  }

  const authParams = new URLSearchParams({ shop });
  if (host) authParams.set("host", host);

  const authPath = `${shopify.config.auth.path}?${authParams.toString()}`;

  if (embedded === "1") {
    const redirectUri = new URL(authPath, process.env.SHOPIFY_APP_URL).toString();
    return res.redirect(`/exitiframe?redirectUri=${encodeURIComponent(redirectUri)}`);
  }

  return res.redirect(authPath);
});

app.use(serveStatic(STATIC_PATH, { index: false }));

app.use("/*", async (_req, res) => {
  const indexHtml = readFileSync(join(STATIC_PATH, "index.html"), "utf8").replace(
    /%%SHOPIFY_API_KEY%%/g,
    process.env.SHOPIFY_API_KEY || ""
  );

  return res
    .status(200)
    .set("Content-Type", "text/html")
    .send(indexHtml);
});

/* ---------------------- Start Server ---------------------- */

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[CRASH] Unhandled rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[CRASH] Uncaught exception:", err);
});

/* ---------------------- GraphQL Queries ---------------------- */

const CURRENT_APP_INSTALLATION = `
query appSubscription($namespace: String!, $key: String!) {
  currentAppInstallation {
    id
    metafield(namespace: $namespace, key: $key) {
      namespace
      key
      value
      id
    }
  }
}
`;

const CREATE_APP_DATA_METAFIELD = `
mutation CreateAppDataMetafield($metafieldsSetInput: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafieldsSetInput) {
    metafields {
      id
      namespace
      key
    }
    userErrors {
      field
      message
    }
  }
}
`;

