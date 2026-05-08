/**
 * GET /api/connect/shopify/callback
 *
 * Handles Shopify's OAuth redirect after the merchant authorizes our app.
 * - Verifies HMAC (request integrity)
 * - Verifies state cookie (CSRF protection)
 * - Verifies shop domain matches the one stored
 * - Exchanges authorization code for access token
 * - Encrypts and stores token in DB
 * - Creates/updates merchant record
 * - Redirects to dashboard
 *
 * Triggered by: Shopify after merchant clicks "Install" or "Approve"
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidShopDomain } from "@/lib/shopify/config";
import {
  verifyOAuthHmac,
  exchangeCodeForToken,
  encryptToken,
  fetchShopMetadata,
} from "@/lib/shopify/oauth";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const shop = searchParams.get("shop");
  const stateParam = searchParams.get("state");

  // 1. Validate parameters
  if (!code || !shop || !stateParam) {
    return errorRedirect(origin, "missing_parameters");
  }

  if (!isValidShopDomain(shop)) {
    return errorRedirect(origin, "invalid_shop_domain");
  }

  // 2. Verify HMAC signature (prevents request forgery)
  if (!verifyOAuthHmac(searchParams)) {
    return errorRedirect(origin, "invalid_hmac");
  }

  // 3. CSRF check: state cookie must match state param
  // Note: when installing via Shopify-generated install link (Custom Distribution),
  // we may not have a state cookie because the flow started on Shopify's side.
  // In that case, HMAC verification (above) is the primary integrity check.
  const cookieState = request.cookies.get("shopify_oauth_state")?.value;
  const cookieShop = request.cookies.get("shopify_oauth_shop")?.value;

  // Strict CSRF check ONLY if we initiated the flow (cookie was set)
  if (cookieState && cookieState !== stateParam) {
    return errorRedirect(origin, "state_mismatch");
  }
  if (cookieShop && cookieShop !== shop) {
    return errorRedirect(origin, "shop_mismatch");
  }

  // 4. Exchange code for access token
  let tokenResponse;
  try {
    tokenResponse = await exchangeCodeForToken(shop, code);
  } catch (error) {
    console.error("[Shopify OAuth] Token exchange failed:", error);
    return errorRedirect(origin, "token_exchange_failed");
  }

  // 5. Fetch shop metadata (name, currency, timezone, etc.)
  let shopMeta;
  try {
    shopMeta = await fetchShopMetadata(shop, tokenResponse.access_token);
  } catch (error) {
    console.error("[Shopify OAuth] Failed to fetch shop metadata:", error);
    // Non-fatal — we can still create the merchant with minimal info
    shopMeta = null;
  }

  // 6. Get the authenticated user (must be logged in to install)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Not logged in — redirect to signin, then come back here after auth
    const signinUrl = new URL("/signin", origin);
    signinUrl.searchParams.set("redirect", `/api/connect/shopify/callback?${searchParams.toString()}`);
    return NextResponse.redirect(signinUrl);
  }

  // 7. Encrypt and store the access token + create/update merchant record
  const encryptedToken = encryptToken(tokenResponse.access_token);
  const scopes = tokenResponse.scope.split(",");

  const { error: upsertError } = await supabase
    .from("merchants")
    .upsert(
      {
        user_id: user.id,
        platform: "shopify",
        shop_domain: shop,
        access_token_encrypted: encryptedToken,
        scopes,
        store_name: shopMeta?.name ?? null,
        store_currency: shopMeta?.currency ?? "USD",
        store_timezone: shopMeta?.iana_timezone ?? null,
        country_code: shopMeta?.country_code ?? null,
        country_name: shopMeta?.country_name ?? null,
        status: "active",
        installed_at: new Date().toISOString(),
        uninstalled_at: null,
      },
      {
        onConflict: "platform,shop_domain",
      }
    );

  if (upsertError) {
    console.error("[Shopify OAuth] Failed to upsert merchant:", upsertError);
    return errorRedirect(origin, "db_error");
  }

  // 7b. Register webhooks (fire-and-forget — don't block redirect on this).
  // We use the merchant's tokenResponse.access_token (plaintext) since this is the install moment.
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? origin;
  const { registerAllWebhooks } = await import("@/lib/shopify/webhooks");
  registerAllWebhooks(shop, tokenResponse.access_token, appBaseUrl)
    .then((r) => {
      console.log(`[Shopify OAuth] Webhooks registered for ${shop}: ${r.registered.join(", ")}`);
      if (r.failed.length > 0) {
        console.warn(`[Shopify OAuth] Webhook failures:`, r.failed);
      }
    })
    .catch((err) => console.error(`[Shopify OAuth] Webhook registration error:`, err));

  // 8. Clear OAuth cookies and redirect into onboarding setup with auto-start flag.
  // The setup runner picks up `?just_connected=1` and immediately fires the pipeline
  // (sync → score → brand voice → strategy) so the merchant doesn't need to click anything.
  const successUrl = new URL("/onboarding/setup", origin);
  successUrl.searchParams.set("just_connected", "1");
  const response = NextResponse.redirect(successUrl);
  response.cookies.delete("shopify_oauth_state");
  response.cookies.delete("shopify_oauth_shop");
  return response;
}

function errorRedirect(origin: string, reason: string) {
  const url = new URL("/dashboard", origin);
  url.searchParams.set("error", `shopify_${reason}`);
  return NextResponse.redirect(url);
}
