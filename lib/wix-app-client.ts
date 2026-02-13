import { AppStrategy } from "@wix/sdk/auth/wix-app-oauth";
import { createClient } from "@wix/sdk/client";
import { contacts, extendedFields } from "@wix/crm";
import { items } from "@wix/data";
import { secrets } from "@wix/secrets";
import type { NextRequest } from "next/server";

/**
 * Minimal type for the Wix Secrets Manager client.
 * The SDK's createClient() returns a bound module whose type is not exactly typeof secrets,
 * so we use this interface and a single helper to avoid casts at every call site.
 */
export interface WixSecretsClient {
  getSecretValue(name: string): Promise<{ value?: string }>;
  listSecretInfo(): Promise<{ secrets?: Array<{ id?: string; _id?: string | null; name?: string | null }> }>;
  createSecret(secret: { name: string; value: string }): Promise<string>;
  updateSecret(_id: string, secret: { name?: string; value?: string }): Promise<void>;
  deleteSecret(_id: string): Promise<void>;
}

/** Returns the Wix client's secrets API typed as WixSecretsClient (one central cast). */
export function getSecretsClient(
  wixClient: ReturnType<typeof getWixClientForInstance>,
): WixSecretsClient {
  return wixClient.secrets as WixSecretsClient;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

/**
 * Centralized Wix app client with AppStrategy authentication.
 * All Wix API modules (contacts, items, secrets) are accessed through this client.
 * Matches the official template pattern for consistent module usage.
 */
export const wixAppClient = createClient({
  auth: AppStrategy({
    appId: requireEnv("WIX_CLIENT_ID"),
    appSecret: requireEnv("WIX_CLIENT_SECRET"),
    publicKey: process.env.WIX_CLIENT_PUBLIC_KEY,
  }),
  modules: {
    contacts,
    items,
    secrets,
    extendedFields
  },
});

/**
 * Returns a Wix client configured for a specific app instance.
 * AppStrategy requires instanceId (or refreshToken) per request; the SDK has no setInstanceId(),
 * so we create a new client with instanceId in the auth options.
 *
 * @param instanceId - The Wix app instance ID
 * @returns SDK client with instance context
 */
export function getWixClientForInstance(instanceId: string) {
  return createClient({
    auth: AppStrategy({
      appId: requireEnv("WIX_CLIENT_ID"),
      appSecret: requireEnv("WIX_CLIENT_SECRET"),
      publicKey: process.env.WIX_CLIENT_PUBLIC_KEY,
      instanceId,
    }),
    modules: {
      contacts,
      items,
      secrets,
      extendedFields
    },
  });
}

/**
 * Extracts the raw access token from a request (Authorization header or accessToken query param).
 * Proxy may set Authorization from ?accessToken=; client may send Authorization or accessToken.
 */
export function getAccessTokenFromRequest(request: Request): string | null {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("accessToken");
  if (fromQuery) return fromQuery;
  const auth = request.headers.get("authorization");
  if (!auth) return null;
  const trimmed = auth.trim();
  if (trimmed.startsWith("Bearer ")) return trimmed.slice(7);
  return trimmed;
}

/**
 * Gets instanceId from wixAppClient.auth.getTokenInfo() using the request's access token.
 * Use this when the client passes the whole instance (access token) to the server.
 */
export async function getInstanceIdFromAccessToken(
  accessToken: string,
): Promise<string> {
  const client = createClient({
    auth: AppStrategy({
      appId: requireEnv("WIX_CLIENT_ID"),
      appSecret: requireEnv("WIX_CLIENT_SECRET"),
      publicKey: process.env.WIX_CLIENT_PUBLIC_KEY,
      accessToken,
    }),
    modules: {},
  });
  const info = await client.auth.getTokenInfo();
  const instanceId = info.instanceId;
  if (!instanceId) {
    throw new Error("Token info missing instanceId");
  }
  return instanceId;
}

export interface ProcessedWixWebhook<TPayload = unknown> {
  eventType: string;
  instanceId: string;
  payload: TPayload;
}

/**
 * Verifies Wix webhook signature and extracts event payload.
 * This matches the official template pattern using webhooks.processRequest().
 */
export async function processWixWebhook<TPayload = unknown>(
  request: NextRequest,
): Promise<ProcessedWixWebhook<TPayload>> {
  const parsed = await wixAppClient.webhooks.processRequest(request);
  return {
    eventType: String(parsed.eventType),
    instanceId: String(parsed.instanceId),
    payload: parsed.payload as TPayload,
  };
}
