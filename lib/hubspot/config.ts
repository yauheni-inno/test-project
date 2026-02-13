// HubSpot OAuth configuration
import type { WixSecretsClient } from '../wix-app-client';
import { HUBSPOT_OAUTH_SCOPES } from '../constants';

export { HUBSPOT_OAUTH_SCOPES };

/** Secret names in Wix Secret Manager for HubSpot OAuth app config (per instance). */
export const HUBSPOT_APP_CONFIG_SECRET_NAMES = {
  CLIENT_ID: 'HUBSPOT_CLIENT_ID',
  CLIENT_SECRET: 'HUBSPOT_CLIENT_SECRET',
  REDIRECT_URI: 'HUBSPOT_REDIRECT_URI',
} as const;

export interface HubspotAppConfig {
  clientId: string;
  clientSecret: string;
  /**
   * Fully-qualified redirect URI configured in the HubSpot app
   * (for example: https://your-domain.com/api/hubspot/oauth/callback).
   */
  redirectUri: string;
}

/**
 * Loads HubSpot OAuth app configuration from Wix Secret Manager (per instance).
 * Requires the three secrets to be created in the app's Secret Manager:
 * - HUBSPOT_CLIENT_ID
 * - HUBSPOT_CLIENT_SECRET
 * - HUBSPOT_REDIRECT_URI
 */
export async function getHubspotAppConfigFromSecrets(
  secrets: WixSecretsClient,
): Promise<HubspotAppConfig> {
  const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } = HUBSPOT_APP_CONFIG_SECRET_NAMES;
  const [clientIdRes, clientSecretRes, redirectUriRes] = await Promise.all([
    secrets.getSecretValue(CLIENT_ID),
    secrets.getSecretValue(CLIENT_SECRET),
    secrets.getSecretValue(REDIRECT_URI),
  ]);

  const clientId = clientIdRes.value?.trim();
  const clientSecret = clientSecretRes.value?.trim();
  const redirectUri = redirectUriRes.value?.trim();

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Missing HubSpot OAuth configuration in Secret Manager. Create HUBSPOT_CLIENT_ID, HUBSPOT_CLIENT_SECRET, and HUBSPOT_REDIRECT_URI for this instance.',
    );
  }

  return { clientId, clientSecret, redirectUri };
}
