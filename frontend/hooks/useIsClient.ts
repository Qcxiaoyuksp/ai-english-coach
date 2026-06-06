// ============================================================
// useIsClient — SSR-safe client detection
// ============================================================
// Returns `false` during SSR and the very first client render,
// then `true` afterwards. This lets components read browser-only
// data (e.g. localStorage) without triggering React hydration
// mismatches, while avoiding setState-inside-effect patterns.
// ============================================================

'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true, // client snapshot
    () => false // server snapshot (matches initial hydration render)
  );
}
