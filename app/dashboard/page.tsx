'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Page,
  Card,
  Button,
  Text,
  Box,
  Loader,
  EmptyState,
  Modal,
  MessageModalLayout,
} from '@wix/design-system';
import '@wix/design-system/styles.global.css';
import type { MappingDirection } from '@/lib/types';
import { useWixSDK } from '@/lib/wix-sdk.client-only';
import { MappingRow, type MappingRowData, type FieldOption } from './MappingRow';

interface ConnectionState {
  connected: boolean;
  portalId?: string;
  expiresAt?: string;
}

export default function DashboardPage() {
  const sdk = useWixSDK();
  const [connection, setConnection] = useState<ConnectionState | null>(null);
  const [mappings, setMappings] = useState<MappingRowData[]>([]);
  const [wixFields, setWixFields] = useState<FieldOption[]>([]);
  const [hubspotFields, setHubspotFields] = useState<FieldOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [backendErrorPopup, setBackendErrorPopup] = useState<string | null>(null);

  /** Get the whole instance (access token) to pass to the server; server uses getTokenInfo() for instanceId. */
  const getAccessToken = useCallback(async (): Promise<string> => {
    try {
      const token = await sdk.dashboard.getAccessToken?.();
      if (token) return token;
    } catch {
      // fallback
    }
    const urlParams = new URLSearchParams(window.location.search);
    const fromQuery = urlParams.get('accessToken');
    if (fromQuery) return fromQuery;
    throw new Error('Missing access token. Open the app from the Wix dashboard.');
  }, [sdk]);

  const apiUrl = useCallback((path: string, token: string) => {
    const sep = path.includes('?') ? '&' : '?';
    return `${path}${sep}accessToken=${encodeURIComponent(token)}`;
  }, []);

  const fetchConnection = useCallback(async () => {
    const token = await getAccessToken();
    const res = await fetch(apiUrl('/api/hubspot/connection', token));
    if (!res.ok) throw new Error('Failed to fetch connection');
    const data = await res.json();
    setConnection({
      connected: data.connected,
      portalId: data.portalId,
      expiresAt: data.expiresAt,
    });
  }, [getAccessToken, apiUrl]);

  const fetchMappings = useCallback(async () => {
    const token = await getAccessToken();
    const res = await fetch(apiUrl('/api/hubspot/mappings', token));
    if (!res.ok) throw new Error('Failed to fetch mappings');
    const data = await res.json();
    setMappings(
      (data.mappings ?? []).map(
        (m: {
          _id?: string;
          wixFieldKey?: string;
          hubspotPropertyKey?: string;
          direction?: MappingDirection;
          transform?: string;
        }) => ({
          id: m._id,
          wixFieldKey: m.wixFieldKey ?? "",
          hubspotPropertyKey: m.hubspotPropertyKey ?? "",
          direction: m.direction ?? "bi_directional",
          transform: m.transform ?? "none",
        })
      )
    );
  }, [getAccessToken, apiUrl]);

  const fetchOptions = useCallback(async () => {
    const token = await getAccessToken();
    const [wixRes, hsRes] = await Promise.all([
      fetch(apiUrl('/api/hubspot/mappings?option=wixFields', token)),
      fetch(apiUrl('/api/hubspot/mappings?option=hubspotProperties', token)),
    ]);
    if (wixRes.ok) {
      const d = await wixRes.json();
      setWixFields(d.fields ?? []);
    }
    if (hsRes.ok) {
      const d = await hsRes.json();
      setHubspotFields(d.fields ?? []);
    }
  }, [getAccessToken, apiUrl]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([fetchConnection(), fetchMappings(), fetchOptions()]);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchConnection, fetchMappings, fetchOptions]);

  const handleConnect = async () => {
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch(apiUrl('/api/hubspot/oauth/start', token));
      if (!res.ok) throw new Error('Failed to start OAuth');
      const data = await res.json();
      if (data.authorizeUrl)
        window.open(data.authorizeUrl, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect');
    }
  };

  const handleDisconnect = async () => {
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch(apiUrl('/api/hubspot/connection', token), {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to disconnect');
      await fetchConnection();
      setToast({ type: 'success', text: 'Disconnected from HubSpot' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disconnect');
    }
  };

  const addRow = () => {
    setMappings((prev) => [
      ...prev,
      {
        wixFieldKey: '',
        hubspotPropertyKey: '',
        direction: 'bi_directional' as MappingDirection,
        transform: 'none',
      },
    ]);
  };

  const removeRow = useCallback((index: number) => {
    setMappings((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateRow = useCallback(
    (index: number, field: keyof MappingRowData, value: string) => {
      setMappings((prev) => {
        const next = [...prev];
        next[index] = { ...prev[index], [field]: value };
        return next;
      });
    },
    []
  );

  const isRowComplete = useCallback((m: MappingRowData) => {
    return Boolean(
      m.wixFieldKey?.trim() &&
        m.hubspotPropertyKey?.trim() &&
        m.direction?.trim() &&
        m.transform?.trim()
    );
  }, []);

  const handleSaveMappings = async () => {
    setValidationError(null);
    setError(null);
    setBackendErrorPopup(null);

    const incomplete = mappings.filter((m) => !isRowComplete(m));
    if (mappings.length > 0 && incomplete.length > 0) {
      setValidationError(
        'All fields are required in each mapping row. Fill in Wix field, HubSpot property, Direction, and Transform.'
      );
      return;
    }

    const payload = mappings
      .filter((m) => isRowComplete(m))
      .map((m) => ({
        wixFieldKey: m.wixFieldKey,
        hubspotPropertyKey: m.hubspotPropertyKey,
        direction: m.direction,
        transform: m.transform || 'none',
      }));

    if (payload.length === 0) {
      setValidationError('Add at least one mapping and fill in all fields.');
      return;
    }

    setSaving(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(apiUrl('/api/hubspot/mappings', token), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          data.message ?? data.error ?? 'Failed to save mappings';
        setBackendErrorPopup(msg);
        setError(msg);
        setToast({ type: 'error', text: msg });
        return;
      }
      await fetchMappings();
      setToast({ type: 'success', text: 'Mappings saved' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save mappings';
      setBackendErrorPopup(msg);
      setError(msg);
      setToast({ type: 'error', text: msg });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Page>
        <Page.Header title="HubSpot Sync" />
        <Page.Content>
          <Box align="center" verticalAlign="middle" minHeight="200px">
            <Loader size="medium" />
          </Box>
        </Page.Content>
      </Page>
    );
  }

  return (
    <Page>
      <Page.Header
        title="HubSpot Sync"
        subtitle="Connect HubSpot and map Wix contact fields to HubSpot properties"
      />
      <Page.Content>
        {error && (
          <Box marginBottom="SP3" padding="SP2" backgroundColor="D10">
            <Text skin="error">{error}</Text>
          </Box>
        )}
        {toast && (
          <Box marginBottom="SP2">
            <Text skin={toast.type === "success" ? "success" : "standard"}>
              {toast.text}
            </Text>
          </Box>
        )}
        {validationError && (
          <Box marginBottom="SP3" padding="SP2" backgroundColor="D10">
            <Text skin="error">{validationError}</Text>
          </Box>
        )}

        <Card>
          <Card.Header title="Connection" />
          <Card.Content>
            {connection?.connected ? (
              <Box direction="vertical" gap="SP2">
                <Text>
                  Connected to HubSpot
                  {connection.portalId
                    ? ` (Portal ${connection.portalId})`
                    : ""}
                  .
                </Text>
                <Button
                  onClick={handleDisconnect}
                  skin="destructive"
                  size="small"
                >
                  Disconnect HubSpot
                </Button>
              </Box>
            ) : (
              <Box direction="vertical" gap="SP2">
                <Text>
                  Not connected. Connect your HubSpot account to sync contacts.
                </Text>
                <Button onClick={handleConnect}>Connect HubSpot</Button>
              </Box>
            )}
          </Card.Content>
        </Card>

        <Box marginTop="SP4">
          <Card>
            <Card.Header
              title="Field Mappings"
              subtitle="Map Wix contact fields to HubSpot properties. Save after editing."
            />
            <Card.Content>
              {!connection?.connected ? (
                <EmptyState
                  title="Connect HubSpot first"
                  subtitle="Connect your HubSpot account above to load HubSpot properties and save mappings."
                />
              ) : (
                <>
                  <Box marginBottom="SP3" gap="SP2">
                    <Button onClick={addRow} size="small" priority="secondary">
                      Add row
                    </Button>
                    <Button
                      onClick={handleSaveMappings}
                      size="small"
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Save mapping"}
                    </Button>
                  </Box>
                  <Box direction="vertical" gap="SP2">
                    {mappings.map((row, rowIndex) => (
                      <MappingRow
                        key={rowIndex}
                        row={row}
                        rowIndex={rowIndex}
                        wixFields={wixFields}
                        hubspotFields={hubspotFields}
                        onUpdate={updateRow}
                        onRemove={removeRow}
                      />
                    ))}
                  </Box>
                </>
              )}
            </Card.Content>
          </Card>
        </Box>

        <Modal
          isOpen={!!backendErrorPopup}
          onRequestClose={() => setBackendErrorPopup(null)}
        >
          <MessageModalLayout
            title="Error"
            content={
              <Text>{backendErrorPopup ?? 'Something went wrong.'}</Text>
            }
            primaryButtonText="OK"
            primaryButtonOnClick={() => setBackendErrorPopup(null)}
            onCloseButtonClick={() => setBackendErrorPopup(null)}
          />
        </Modal>
      </Page.Content>
    </Page>
  );
}
