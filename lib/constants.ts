// Constants used throughout the application

export const HUBSPOT_OAUTH_SCOPES = [
  'oauth',
  // Contacts read/write
  'crm.objects.contacts.read',
  'crm.objects.contacts.write',
  // Contact properties read
  'crm.schemas.contacts.read',
];

export const DEDUPE_WINDOW_MS = 60 * 1000; // 1 minute

// Wix Data collection IDs
export const COLLECTIONS = {
  CONNECTIONS: 'hubspot_connections',
  MAPPINGS: 'hubspot_field_mappings',
  CONTACT_LINKS: 'hubspot_contact_links',
  PROCESSED_WEBHOOK_EVENTS: 'hubspot_processed_webhook_events',
} as const;

// Wix contact fields available for mapping
export const WIX_CONTACT_FIELDS = [
  { key: 'email', label: 'Email' },
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName', label: 'Last Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'company', label: 'Company' },
  { key: 'jobTitle', label: 'Job Title' },
  { key: 'notes', label: 'Notes' },
  { key: 'utm_source', label: 'UTM Source' },
  { key: 'utm_medium', label: 'UTM Medium' },
  { key: 'utm_campaign', label: 'UTM Campaign' },
  { key: 'utm_term', label: 'UTM Term' },
  { key: 'utm_content', label: 'UTM Content' },
  { key: 'pageUrl', label: 'Page URL' },
  { key: 'referrer', label: 'Referrer' },
  { key: 'timestamp', label: 'Timestamp' },
] as const;

export const TRANSFORM_OPTIONS: { value: string; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'trim', label: 'Trim' },
  { value: 'lowercase', label: 'Lowercase' },
  { value: 'uppercase', label: 'Uppercase' },
];

export const DIRECTION_OPTIONS: { value: string; label: string }[] = [
  { value: 'wix_to_hubspot', label: 'Wix → HubSpot' },
  { value: 'hubspot_to_wix', label: 'HubSpot → Wix' },
  { value: 'bi_directional', label: 'Bi-directional' },
];
