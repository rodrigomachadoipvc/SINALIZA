import { useSession } from '../auth/session';
import { useDraft } from '../store/draft';

// The library's own mock: safe areas with zero insets and a fixed 320 × 640 frame.
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<{ default: unknown }>('react-native-safe-area-context/jest/mock').default,
);

// Module-level stores would otherwise leak between tests (reset before render, not after).
beforeEach(() => {
  useSession.setState({ status: 'signedOut', session: null });
  useDraft.getState().reset();
});
