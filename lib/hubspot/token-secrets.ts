/**
 * HubSpot OAuth tokens stored as three separate secrets in Wix Secret Manager:
 * - {baseName}_access
 * - {baseName}_refresh
 * - {baseName}_expires
 *
 * Secret Manager is already scoped per instance via getWixClientForInstance(instanceId),
 * so the base name does not include instanceId.
 */
import type { WixSecretsClient } from '../wix-app-client';
import type { HubspotTokenBundle } from '../types';

/** Base name for token secrets (same for all instances; scope is via the client's instanceId). */
export const TOKENS_SECRET_BASE_NAME = 'hubspot_tokens';
const SUFFIX_ACCESS = '_access';
const SUFFIX_REFRESH = '_refresh';
const SUFFIX_EXPIRES = '_expires';

export function getTokenSecretNames(baseName: string): [string, string, string] {
  return [
    `${baseName}${SUFFIX_ACCESS}`,
    `${baseName}${SUFFIX_REFRESH}`,
    `${baseName}${SUFFIX_EXPIRES}`,
  ];
}

/** Wix listSecretInfo returns items with _id (and name); we normalize to id for updateSecret/deleteSecret. */
function findSecretByName(
  secrets: Array<{ id?: string; _id?: string | null; name?: string | null; key?: string }> | undefined,
  name: string
): { id: string; name: string } | undefined {
  if (!Array.isArray(secrets)) return undefined;
  const s = secrets.find(
    (item) => (item.name ?? (item as { key?: string }).key) === name
  );
  if (!s) return undefined;
  const id = s.id ?? s._id ?? undefined;
  return typeof id === 'string' && id ? { id, name: s.name ?? name } : undefined;
}

async function upsertSecret(
  client: WixSecretsClient,
  name: string,
  value: string
): Promise<void> {
  const list = await client.listSecretInfo();
  const existing = findSecretByName(list.secrets, name);
  if (existing?.id) {
    await client.updateSecret(existing.id, { name, value });
    return;
  }
  try {
    await client.createSecret({ name, value });
  } catch (err: unknown) {
    const listAgain = await client.listSecretInfo();
    const found = findSecretByName(listAgain.secrets, name);
    if (found?.id) {
      await client.updateSecret(found.id, { name, value });
      return;
    }
    throw err;
  }
}

export async function writeTokenSecrets(
  client: WixSecretsClient,
  baseName: string,
  bundle: HubspotTokenBundle
): Promise<void> {
  const [accessName, refreshName, expiresName] = getTokenSecretNames(baseName);
  await Promise.all([
    upsertSecret(client, accessName, bundle.accessToken),
    upsertSecret(client, refreshName, bundle.refreshToken),
    upsertSecret(client, expiresName, bundle.expiresAt),
  ]);
}

export async function readTokenSecrets(
  client: WixSecretsClient,
  baseName: string
): Promise<HubspotTokenBundle> {
  const [accessName, refreshName, expiresName] = getTokenSecretNames(baseName);
  const [accessRes, refreshRes, expiresRes] = await Promise.all([
    client.getSecretValue(accessName),
    client.getSecretValue(refreshName),
    client.getSecretValue(expiresName),
  ]);
  const accessToken = accessRes.value;
  const refreshToken = refreshRes.value;
  const expiresAt = expiresRes.value;
  if (!accessToken || !refreshToken || !expiresAt) {
    throw new Error(`Missing HubSpot token secrets for ${baseName}`);
  }
  return { accessToken, refreshToken, expiresAt };
}

export async function deleteTokenSecrets(
  client: WixSecretsClient,
  baseName: string
): Promise<void> {
  const [accessName, refreshName, expiresName] = getTokenSecretNames(baseName);
  const list = await client.listSecretInfo();
  const names = new Set([accessName, refreshName, expiresName]);
  const toDelete = list.secrets?.filter((s) => names.has(s.name ?? '')) ?? [];
  for (const entry of toDelete) {
    const id = entry.id ?? entry._id ?? undefined;
    if (id) {
      await client.deleteSecret(id);
    }
  }
}
