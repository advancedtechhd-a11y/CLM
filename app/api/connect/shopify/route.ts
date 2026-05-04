/**
 * GET /api/connect/shopify
 *
 * Initiates the Shopify OAuth flow.
 * - Validates the shop domain
 * - Generates a CSRF state token
 * - Stores state in a signed cookie
 * - Redirects to Shopify's authorization URL
 *
 * Called from the merchant's first install (e.g. clicking "Install" in App Store).
 * Shopify redirects here with `?shop=foo.myshopify.com`.
 */

import { NextRequest, NextResponse } from "next/server";
import { isValidShopDomain, buildAuthUrl, buildCallbackUrl } from "@/lib/shopify/config";
import { generateOAuthState } from "@/lib/shopify/oauth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const shop = searchParams.get("shop");

  if (!shop || !isValidShopDomain(shop)) {
    return NextResponse.json(
      { error: "Invalid or missing shop parameter. Expected format: xxxxx.myshopify.com" },
      { status: 400 }
    );
  }

  const state = generateOAuthState();
  const callbackUrl = buildCallbackUrl();
  const authUrl = buildAuthUrl(shop, state, callbackUrl);

  // Store state in a short-lived signed cookie for CSRF check on callback
  const response = NextResponse.redirect(authUrl);
  response.cookies.set("shopify_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10, // 10 minutes — OAuth flow should complete in seconds
    path: "/",
  });
  response.cookies.set("shopify_oauth_shop", shop, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  });

  return response;
}
