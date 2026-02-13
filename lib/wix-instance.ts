// Wix instance extraction utilities
// Prefer instanceId from wixAppClient.auth.getTokenInfo() when client passes access token.

import {
  getAccessTokenFromRequest,
  getInstanceIdFromAccessToken,
} from './wix-app-client';

interface WixJwtData {
  instanceId?: string;
  [key: string]: unknown;
}

function decodeBase64Url(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

/**
 * Wix dashboard/app requests may provide Authorization as:
 * - "Bearer <jwt>"
 * - "JWS.<jwt>"
 */
function extractRawJwt(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const trimmed = authorizationHeader.trim();
  if (trimmed.startsWith('Bearer ')) return trimmed.slice(7);
  if (trimmed.startsWith('JWS.')) return trimmed.slice(4);
  return trimmed || null;
}

/**
 * Decodes a JWT payload without signature validation.
 * Fallback when getTokenInfo() is not used (e.g. webhooks).
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = decodeBase64Url(parts[1]);
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getInstanceIdFromJwtPayload(request: Request): string | null {
  const raw = extractRawJwt(request.headers.get('authorization'));
  if (!raw) return null;

  const payload = decodeJwtPayload(raw);
  if (!payload) return null;

  const dataField = payload.data;
  if (typeof dataField === 'string') {
    try {
      const parsed = JSON.parse(dataField) as WixJwtData;
      if (typeof parsed.instanceId === 'string' && parsed.instanceId) return parsed.instanceId;
    } catch {
      // ignore
    }
  } else if (dataField && typeof dataField === 'object') {
    const typed = dataField as WixJwtData;
    if (typeof typed.instanceId === 'string' && typed.instanceId) return typed.instanceId;
  }

  if (typeof payload.instanceId === 'string' && payload.instanceId) return payload.instanceId;
  return null;
}

/**
 * Gets the instance ID from query or custom header (sync fallback).
 */
export function getInstanceId(request: Request): string | null {
  const url = new URL(request.url);
  return (
    url.searchParams.get('instanceId') ||
    request.headers.get('x-wix-instance-id') ||
    getInstanceIdFromJwtPayload(request)
  );
}

/**
 * Resolves instance ID from the request. Prefers wixAppClient.auth.getTokenInfo()
 * when the client passes the whole instance (access token). Falls back to query/header/JWT decode.
 */
export async function getInstanceIdFromRequest(request: Request): Promise<string | null> {
  const accessToken = getAccessTokenFromRequest(request);
  if (accessToken) {
    try {
      return await getInstanceIdFromAccessToken(accessToken);
    } catch {
      // Fall through to fallbacks
    }
  }
  return getInstanceId(request);
}

/**
 * Validates that an instance ID is present (sync; use getInstanceIdFromRequest for token-based resolution).
 */
export function requireInstanceId(request: Request): string {
  const instanceId = getInstanceId(request);
  if (!instanceId) {
    throw new Error('Missing instanceId in request');
  }
  return instanceId;
}

/**
 * Async: requires instance ID, using getTokenInfo() when access token is provided.
 */
export async function requireInstanceIdFromRequest(request: Request): Promise<string> {
  const instanceId = await getInstanceIdFromRequest(request);
  if (!instanceId) {
    throw new Error('Missing instance or instanceId in request. Pass accessToken (or instanceId) from the dashboard.');
  }
  return instanceId;
}
