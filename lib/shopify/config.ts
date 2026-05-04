/**
 * Shopify integration configuration.
 * Centralizes scopes, API versions, and OAuth URLs.
 */

export const SHOPIFY_API_VERSION = "2024-10";

/**
 * OAuth scopes we request on app install.
 * See: https://shopify.dev/docs/api/usage/access-scopes
 */
export const SHOPIFY_SCOPES = [
  "read_customers",
  "read_orders",
  "read_products",
  "read_marketing_events",
  "read_discounts",
  "read_price_rules",
  "read_themes",
  "read_checkouts",
].join(",");

export function getShopifyClientId(): string {
  const clientId = process.env.SHOPIFY_API_KEY;
  if (!clientId) throw new Error("SHOPIFY_API_KEY not set");
  return clientId;
}

export function getShopifyClientSecret(): string {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) throw new Error("SHOPIFY_API_SECRET not set");
  return secret;
}

/**
 * Validates that a string is a real Shopify shop domain (foo.myshopify.com).
 * Critical for security — prevents OAuth from being abused with attacker-controlled hosts.
 */
export function isValidShopDomain(shop: string): boolean {
  if (!shop) return false;
  // Must be lowercase alphanumeric + hyphens, ending in .myshopify.com
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop);
}

export function buildAuthUrl(shop: string, state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: getShopifyClientId(),
    scope: SHOPIFY_SCOPES,
    redirect_uri: redirectUri,
    state,
    "grant_options[]": "",
  });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

export function buildCallbackUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
  return `${appUrl}/api/connect/shopify/callback`;
}
