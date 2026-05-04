/**
 * Shopify Admin REST API client.
 * Uses the stored encrypted access token for a merchant.
 */

import { SHOPIFY_API_VERSION } from "./config";
import { decryptToken } from "./oauth";

interface ShopifyAdminClientOptions {
  shop: string;
  accessToken: string;
}

export class ShopifyAdminClient {
  private readonly shop: string;
  private readonly accessToken: string;

  constructor(opts: ShopifyAdminClientOptions) {
    this.shop = opts.shop;
    this.accessToken = opts.accessToken;
  }

  private url(path: string): string {
    return `https://${this.shop}/admin/api/${SHOPIFY_API_VERSION}${path}`;
  }

  async get<T = unknown>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async put<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  async delete<T = unknown>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(this.url(path), {
      method,
      headers: {
        "X-Shopify-Access-Token": this.accessToken,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    // Shopify rate limit: 40 calls/sec on standard. Respect Retry-After.
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get("Retry-After") ?? "2", 10);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return this.request<T>(method, path, body);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Shopify ${method} ${path} ${response.status}: ${text}`);
    }

    if (response.status === 204) {
      return null as unknown as T;
    }

    return response.json();
  }
}

/**
 * Build a client for a merchant by reading and decrypting their stored token.
 */
export function createClientFromMerchant(merchant: {
  shop_domain: string;
  access_token_encrypted: string;
}): ShopifyAdminClient {
  return new ShopifyAdminClient({
    shop: merchant.shop_domain,
    accessToken: decryptToken(merchant.access_token_encrypted),
  });
}
