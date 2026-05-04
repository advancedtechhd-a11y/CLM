/**
 * Shopify OAuth helpers.
 * - HMAC verification (request authentication)
 * - Authorization code → access token exchange
 */

import crypto from "node:crypto";
import { getShopifyClientSecret, getShopifyClientId, SHOPIFY_API_VERSION } from "./config";

/**
 * Verifies the HMAC signature on a Shopify OAuth callback.
 * Shopify signs all OAuth callbacks with HMAC-SHA256 of the query params (sorted, joined),
 * keyed with the app's client secret.
 *
 * Without this verification, an attacker could forge an OAuth callback.
 */
export function verifyOAuthHmac(searchParams: URLSearchParams): boolean {
  const params = new URLSearchParams(searchParams);
  const hmac = params.get("hmac");
  if (!hmac) return false;
  params.delete("hmac");
  params.delete("signature");
  // Build canonical message — sorted, URL-encoded
  const message = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const computed = crypto
    .createHmac("sha256", getShopifyClientSecret())
    .update(message)
    .digest("hex");
  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac, "hex"), Buffer.from(computed, "hex"));
  } catch {
    return false;
  }
}

/**
 * Verifies HMAC on a webhook request body.
 * Shopify sends the HMAC in the X-Shopify-Hmac-SHA256 header.
 * Webhooks use the raw request body, NOT URL-encoded params.
 */
export function verifyWebhookHmac(rawBody: string, hmacHeader: string): boolean {
  const computed = crypto
    .createHmac("sha256", getShopifyClientSecret())
    .update(rawBody, "utf8")
    .digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(hmacHeader), Buffer.from(computed));
  } catch {
    return false;
  }
}

/**
 * Exchanges an OAuth authorization code for an access token.
 * Called from the callback route after Shopify redirects back to us with a code.
 */
export interface AccessTokenResponse {
  access_token: string;
  scope: string;
}

export async function exchangeCodeForToken(
  shop: string,
  code: string
): Promise<AccessTokenResponse> {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: getShopifyClientId(),
      client_secret: getShopifyClientSecret(),
      code,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify token exchange failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Generate a cryptographically random state string for OAuth.
 * State is used to prevent CSRF — we set it before redirecting to Shopify
 * and verify it matches when Shopify redirects back.
 */
export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Encrypt a token for at-rest storage in the DB.
 * Uses AES-256-GCM with the ENCRYPTION_KEY env var.
 */
export function encryptToken(plaintext: string): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new Error("ENCRYPTION_KEY must be at least 32 chars");
  }
  const keyBuffer = crypto.createHash("sha256").update(key).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv:authTag:ciphertext (all base64)
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptToken(encrypted: string): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new Error("ENCRYPTION_KEY must be at least 32 chars");
  }
  const keyBuffer = crypto.createHash("sha256").update(key).digest();
  const [ivB64, authTagB64, ciphertextB64] = encrypted.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted token");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuffer, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * Fetch shop metadata from Shopify (called after token exchange).
 * Used to populate merchant record with store name, currency, timezone.
 */
export interface ShopMetadata {
  name: string;
  email: string;
  domain: string;
  myshopify_domain: string;
  currency: string;
  timezone: string;
  iana_timezone: string;
  shop_owner: string;
  country_code: string;
  plan_name: string;
}

export async function fetchShopMetadata(
  shop: string,
  accessToken: string
): Promise<ShopMetadata> {
  const response = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch shop metadata: ${response.status}`);
  }
  const data = await response.json();
  return data.shop;
}
