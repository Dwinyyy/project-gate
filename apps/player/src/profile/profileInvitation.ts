const landing = '/profile-invitation';
const canonicalToken = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;

export type ProfileInvitationSnapshot = { token: string | null; boundReader: string | null };
export interface ProfileInvitationMemory {
  getSnapshot(): ProfileInvitationSnapshot;
  subscribe(listener: () => void): () => void;
  captureLink(value: string, origin: string): boolean;
  bindReader(attemptKey: string): boolean;
  clear(): void;
}

export function parseProfileInvitationLink(value: string, origin: string): string | null {
  try {
    const url = new URL(value);
    const token = url.hash.slice('#token='.length);
    return url.origin === origin &&
      !url.username &&
      !url.password &&
      canonicalToken.test(token) &&
      value === `${origin}${landing}#token=${token}`
      ? token
      : null;
  } catch {
    return null;
  }
}

export function captureInitialProfileInvitation(
  location: Location,
  history: History,
): string | null {
  if (location.pathname !== landing) return null;
  const token = parseProfileInvitationLink(location.href, location.origin);
  // Router can read history.state.masked on its very first mount. Clear it as
  // well as every query/fragment, even when the landing input is invalid.
  history.replaceState(null, '', landing);
  return token;
}

export function buildProfileInvitationLink(origin: string, token: string): string {
  const value = `${origin}${landing}#token=${token}`;
  if (!parseProfileInvitationLink(value, origin)) throw new Error('Invalid profile invitation.');
  return value;
}

export function createProfileInvitationMemory(
  ...capture: [capturedToken: string | null]
): ProfileInvitationMemory {
  let snapshot: ProfileInvitationSnapshot = {
    token: capture.pop() ?? null,
    boundReader: null,
  };
  // Empty the bootstrap argument container; there is no reusable seed binding.
  if (snapshot.token && !canonicalToken.test(snapshot.token)) snapshot.token = null;
  const listeners = new Set<() => void>();
  function replace(next: ProfileInvitationSnapshot) {
    snapshot = next;
    for (const listener of listeners) listener();
  }
  function clear() {
    if (snapshot.token !== null || snapshot.boundReader !== null)
      replace({ token: null, boundReader: null });
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    captureLink: (value, origin) => {
      const token = parseProfileInvitationLink(value, origin);
      clear();
      if (!token) return false;
      replace({ token, boundReader: null });
      return true;
    },
    bindReader: (attemptKey) => {
      if (!snapshot.token) return false;
      if (snapshot.boundReader && snapshot.boundReader !== attemptKey) {
        clear();
        return false;
      }
      if (!snapshot.boundReader) replace({ token: snapshot.token, boundReader: attemptKey });
      return true;
    },
    clear,
  };
}
