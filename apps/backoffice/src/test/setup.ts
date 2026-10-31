import '@testing-library/jest-dom/vitest';

import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

import { sessionStore } from '../auth/session-store';

// Pages with Leaflet or Recharts are lazy-loaded; the first import can take over a second.
configure({ asyncUtilTimeout: 5000 });

// jsdom has no layout engine: Recharts and Leaflet need these to mount.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

afterEach(() => {
  cleanup();
  sessionStore.set(null);
  sessionStore.takeEndReason();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});
