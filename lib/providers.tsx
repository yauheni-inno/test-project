'use client';
import type { PropsWithChildren } from 'react';
import { WixDesignSystemProvider } from '@wix/design-system';

/**
 * Client-side providers wrapper.
 * Matches the template pattern for consistent design system setup.
 */
export const AppProviders = ({ children }: PropsWithChildren) => {
  return (
    <WixDesignSystemProvider
      features={{
        newColorsBranding: true,
      }}
    >
      {children}
    </WixDesignSystemProvider>
  );
};
