# Wix Self-Hosted App - HubSpot Integration

A Next.js-based Wix self-hosted app that provides **bi-directional contact sync** between Wix and HubSpot with form capture integration.

## Features

### ✅ Feature #1 — Reliable Bi-Directional Contact Sync (Core)
- **Automatic two-way sync** between Wix contacts and HubSpot contacts
- **New contact creation**: Wix → HubSpot, HubSpot → Wix
- **Contact updates**: Wix ↔ HubSpot (bi-directional)
- **User-configurable property mapping**: Map any Wix field to HubSpot property
- **Conflict handling**: "Last updated wins" using timestamps
- **Infinite loop prevention**:
  - External ID mapping (WixContactId ↔ HubSpotContactId)
  - Sync source tracking (`lastSyncSource`, `lastSyncAt`, `lastSyncHash`)
  - Webhook/event deduplication (60-second window)
  - Idempotency via content hashing and processed-event storage (HubSpot webhooks)

### ✅ Feature #2 — Form & Lead Capture Integration
- **Wix form submission handler** that creates/updates HubSpot contacts
- **Attribution tracking**:
  - UTM parameters (source, medium, campaign, term, content)
  - Page URL and referrer
  - Timestamp
- All attribution data is preserved in HubSpot as custom properties

### ✅ Security & Connection Requirements
- **OAuth 2.0** connection to HubSpot (no API keys in frontend)
- **Secure token storage** in Wix Secrets Manager
- **Automatic token refresh** with rotation support
- **Least privilege scopes**:
  - `crm.objects.contacts.read`
  - `crm.objects.contacts.write`
  - `crm.schemas.contacts.read`
- Safe logging (never logs tokens or PII)
- **Optional HubSpot webhook signature verification** when `HUBSPOT_WEBHOOK_SECRET` is set

### ✅ Field Mapping UI
- **Dashboard interface** for mapping Wix fields to HubSpot properties
- **Table UI** with:
  - Wix field dropdown
  - HubSpot property dropdown
  - Sync direction (Wix → HubSpot, HubSpot → Wix, Bi-directional)
  - Transform options (none, trim, lowercase, uppercase)
- Mappings are user-configurable without code changes

---

## Architecture

### Tech Stack
- **Framework**: Next.js 16 (App Router)
- **Package Manager**: pnpm
- **Wix SDK**: `@wix/sdk`, `@wix/crm`, `@wix/secrets`, `@wix/data`, `@wix/api-client`
- **UI**: `@wix/design-system` (Wix native components)
- **TypeScript**: Full type safety

### Project Structure
```
wx-next/
├── app/
│   ├── api/
│   │   ├── hubspot/
│   │   │   ├── oauth/
│   │   │   │   ├── start/route.ts          # OAuth start endpoint
│   │   │   │   └── callback/route.ts       # OAuth callback handler
│   │   │   ├── connection/route.ts         # Connection management
│   │   │   ├── mappings/route.ts           # Field mapping CRUD
│   │   │   └── webhook/route.ts            # HubSpot → Wix webhook
│   │   └── wix/
│   │       ├── form-submission/route.ts    # Form capture handler
│   │       └── webhook/route.ts            # Wix contact events (onContactCreated, onContactUpdated)
│   ├── dashboard/
│   │   ├── page.tsx                        # Main dashboard UI
│   │   └── MappingRow.tsx
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── types.ts                            # TypeScript type definitions
│   ├── constants.ts                        # App constants, collections, field options
│   ├── wix-app-client.ts                   # Wix SDK client (AppStrategy), webhook verification
│   ├── wix-sdk.client-only.ts              # Client-only Wix SDK usage
│   ├── wix-instance.ts                     # Instance resolution helpers
│   ├── wix-extended-fields.ts              # Extended contact fields
│   ├── wix-webhook-handlers.ts             # Wix contact event → sync handlers
│   ├── mapping.ts                          # Field mapping logic
│   ├── sync-service.ts                     # Bi-directional sync engine
│   ├── contact-envelope-to-wix-contact.ts  # Form/submission → Wix contact shape
│   ├── providers.tsx                       # React context providers
│   ├── hubspot/
│   │   ├── config.ts                       # HubSpot OAuth config
│   │   ├── client.ts                       # HubSpot API client
│   │   ├── token-secrets.ts                # Token storage in Wix Secrets
│   │   ├── webhook-signature.ts            # Optional HubSpot webhook signature verification
│   │   └── webhooks.ts                     # HubSpot webhook subscription helpers
│   └── stores/
│       ├── connection-store.ts             # HubSpot connection data
│       ├── mapping-store.ts                # Field mapping data
│       ├── contact-link-store.ts           # Contact relationship data
│       └── processed-webhook-events-store.ts  # HubSpot event idempotency
├── hubspot-project/                        # Optional HubSpot CLI project config
├── package.json
├── tsconfig.json
├── next.config.ts
├── .env.example
└── README.md
```

---

## API Plan

### A) APIs Used Per Feature

#### Feature #1: Bi-Directional Contact Sync

**Wix APIs:**
- **Wix CRM Contacts API** (`@wix/crm`)
  - `contacts.getContact()` - Read contact data
  - `contacts.updateContact()` - Update Wix contacts from HubSpot
- **Wix Data API** (`@wix/data`)
  - Store connection records, mappings, contact links, and processed webhook event IDs
- **Wix Contact Events**
  - `contacts.onContactCreated()` - Trigger Wix → HubSpot sync
  - `contacts.onContactUpdated()` - Trigger Wix → HubSpot sync

**HubSpot APIs:**
- **HubSpot CRM Contacts API**
  - `POST /crm/v3/objects/contacts` - Create contacts
  - `PATCH /crm/v3/objects/contacts/{id}` - Update contacts
  - `POST /crm/v3/objects/contacts/search` - Search by email
- **HubSpot Properties API**
  - `GET /crm/v3/properties/contacts` - List available properties for mapping
- **HubSpot Webhooks**
  - `contact.propertyChange` - Detect HubSpot → Wix updates
  - `contact.creation` - Detect new contacts in HubSpot

#### Feature #2: Form & Lead Capture

**Wix APIs:**
- Custom API endpoint `/api/wix/form-submission`
- Accepts form data with UTM tracking parameters

**HubSpot APIs:**
- `POST /crm/v3/objects/contacts` - Create/update contact with form data
- Stores UTM parameters as custom properties

---

## Setup Instructions

### Prerequisites
1. **Wix Developer Account**: [Create an app](https://manage.wix.com/account/custom-apps)
2. **HubSpot Developer Account**: [Create an app](https://app.hubspot.com/signup/developers)
3. **Node.js 20+** and **pnpm** installed

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Configure HubSpot OAuth App
1. Go to [HubSpot App Settings](https://developers.hubspot.com/)
2. Create a new app or use existing
3. Set **Redirect URL**: `https://your-domain.com/api/hubspot/oauth/callback`
4. Copy **Client ID** and **Client Secret**
5. Set required scopes:
   - `crm.objects.contacts.read`
   - `crm.objects.contacts.write`
   - `crm.schemas.contacts.read`

### 3. Store Secrets in Wix Secrets Manager
HubSpot OAuth app config and tokens are read from your Wix app's Secrets Manager (per instance). Create these secrets for each instance that will connect to HubSpot:
- **`HUBSPOT_CLIENT_ID`** — Your HubSpot app client ID
- **`HUBSPOT_CLIENT_SECRET`** — Your HubSpot app client secret
- **`HUBSPOT_REDIRECT_URI`** — Your OAuth callback URL (e.g. `https://your-domain.com/api/hubspot/oauth/callback`)

(OAuth tokens are stored automatically under `hubspot_tokens_*` when a site connects.)

### 4. Environment Variables (for self-hosted backend)
Copy `.env.example` to `.env.local` and set:
- **Wix backend auth**: `WIX_CLIENT_ID`, `WIX_CLIENT_SECRET` (required); `WIX_CLIENT_PUBLIC_KEY` optional for webhook verification
- **Optional**: `HUBSPOT_WEBHOOK_SECRET` for HubSpot webhook signature verification
- **Optional**: `HUBSPOT_WEBHOOK_BASE_URL`, `HUBSPOT_APP_ID`, `HUBSPOT_DEVELOPER_API_KEY` (or `HUBSPOT_HAPIKEY`) for HubSpot webhook subscription management

### 5. Configure Wix Data Collections
Create the following collections in Wix Data:
1. **`hubspot_connections`**
   - `instanceId` (Text, required)
   - `portalId` (Text)
   - `tokensSecretName` (Text, required)
   - `expiresAt` (Date)
   - `createdAt` (Date)
   - `updatedAt` (Date)

2. **`hubspot_field_mappings`**
   - `instanceId` (Text, required)
   - `wixFieldKey` (Text, required)
   - `hubspotPropertyKey` (Text, required)
   - `direction` (Text, required)
   - `transform` (Text)
   - `createdAt` (Date)
   - `updatedAt` (Date)

3. **`hubspot_contact_links`**
   - `instanceId` (Text, required)
   - `wixContactId` (Text, required)
   - `hubspotContactId` (Text, required)
   - `lastSyncSource` (Text) — `wix` or `hubspot` (for loop prevention)
   - `lastSyncAt` (Date)
   - `lastSyncHash` (Text) — hash of mapped values for idempotency
   - `createdAt` (Date)
   - `updatedAt` (Date)

4. **`hubspot_processed_webhook_events`**
   - `instanceId` (Text, required)
   - `eventId` (Text, required) — HubSpot webhook event ID for idempotency
   - `processedAt` (Date)

### 6. Configure Wix App Extensions
In your Wix App Dashboard:

**Dashboard Page Extension:**
- URL: `https://your-domain.com/dashboard`
- Name: "HubSpot Sync"


**Backend Event Handlers (Contact events):**  
Point both **Contact Created** and **Contact Updated** to the same URL:
- `https://your-domain.com/api/wix/webhook?instanceId={{instanceId}}`

### 7. Configure HubSpot Webhooks
In your HubSpot app settings:
- Webhook URL: `https://your-domain.com/api/hubspot/webhook?instanceId={{YOUR_INSTANCE_ID}}`
- Subscribe to:
  - `contact.propertyChange`
  - `contact.creation`

(Optional: set `HUBSPOT_WEBHOOK_SECRET` and configure signature verification in your HubSpot app.)

### 8. Deploy
Deploy to your hosting platform (Vercel, AWS, etc.):
```bash
pnpm build
pnpm start
```

---

## Usage

### Connect HubSpot
1. Install the app on a Wix site
2. Go to the "HubSpot Sync" dashboard page
3. Click "Connect HubSpot"
4. Authorize the connection in the popup

### Configure Field Mappings
1. In the dashboard, click "Add row"
2. Select a Wix field (e.g., "Email")
3. Select a HubSpot property (e.g., "email")
4. Choose sync direction:
   - **Wix → HubSpot**: Only sync changes from Wix to HubSpot
   - **HubSpot → Wix**: Only sync changes from HubSpot to Wix
   - **Bi-directional**: Sync changes in both directions
5. Choose transform (optional): trim, lowercase, uppercase
6. Click "Save mapping"

### Test Contact Sync
1. Create or update a contact in Wix
2. Verify it appears/updates in HubSpot
3. Update a contact in HubSpot
4. Verify it updates in Wix

### Capture Form Submissions
Send a POST request to `/api/wix/form-submission?instanceId={{instanceId}}` with:
```json
{
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890",
  "utm_source": "google",
  "utm_medium": "cpc",
  "utm_campaign": "spring_sale",
  "pageUrl": "https://example.com/contact",
  "referrer": "https://google.com"
}
```

---

## Loop Prevention Mechanism

The app implements multiple strategies to prevent infinite sync loops:

1. **Content Hashing + Sync Source**
   - Each sync stores `lastSyncHash` (hash of mapped field values) and `lastSyncSource` (`wix` or `hubspot`) on the contact link
   - Incoming webhooks are skipped when the computed hash matches `lastSyncHash` and the last sync was from the same source, within the dedupe window

2. **Dedupe Window**
   - 60-second window: if the same content was just synced from the other side, the update is skipped

3. **Processed Event Store (HubSpot webhooks)**
   - HubSpot webhook event IDs are stored in `hubspot_processed_webhook_events`
   - Duplicate or re-delivered events are skipped for idempotency


## API Reference

### GET /api/hubspot/connection
Get current HubSpot connection status
- **Query**: `instanceId`
- **Response**: `{ connected: boolean, portalId?: string }`

### DELETE /api/hubspot/connection
Disconnect HubSpot
- **Query**: `instanceId`
- **Response**: `{ success: boolean }`

### GET /api/hubspot/mappings
Get field mappings or field options
- **Query**: `instanceId`, `option?` (wixFields | hubspotProperties)
- **Response**: `{ mappings: [...] }` or `{ fields: [...] }`

### POST /api/hubspot/mappings
Save field mappings
- **Query**: `instanceId`
- **Body**: `{ mappings: [{ wixFieldKey, hubspotPropertyKey, direction, transform }] }`
- **Response**: `{ success: boolean, mappings: [...] }`

### POST /api/wix/form-submission
Submit form data to HubSpot
- **Query**: `instanceId`
- **Body**: `{ email, firstName, lastName, phone, utm_*, pageUrl, referrer, ... }`
- **Response**: `{ success: boolean, hubspotContactId: string }`
