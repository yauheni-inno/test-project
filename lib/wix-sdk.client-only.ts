'use client';
import { dashboard, SDK } from '@wix/dashboard';
import { useMemo } from 'react';
import { createClient } from '@wix/sdk/client';

function inIframe() {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
}

/**
 * Client-side SDK hook for dashboard pages.
 * Initializes the Wix Dashboard SDK when running inside an iframe.
 * Matches the official template pattern.
 */
export const useWixSDK = () => {
  const sdk = useMemo(
    () =>
      typeof window === 'undefined' || !inIframe()
        ? {
            // The SDK is not initialized during server-side rendering or outside an iframe
            dashboard: {} as SDK,
          }
        : createClient({
            host: dashboard.host(),
            auth: dashboard.auth(),
            modules: {
              dashboard,
            },
          }),
    []
  );
  return sdk;
};
