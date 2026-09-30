import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AuthActionError,
  createBrowserAuthController,
  getSelfSession,
  type AuthController,
  type AuthSnapshot,
} from '@hunter-world/client';

type SelfSession = Awaited<ReturnType<typeof getSelfSession>>;

interface AccountContextValue {
  controller: AuthController | null;
  auth: AuthSnapshot;
  validation: 'none' | 'checking' | 'valid' | 'invalid';
  session: SelfSession | null;
  validationGeneration: number;
  validationError: string | null;
}

const initializing: AuthSnapshot = {
  phase: 'initializing',
  user: null,
  accessToken: null,
  error: null,
};
const unavailable: AuthSnapshot = {
  phase: 'unavailable',
  user: null,
  accessToken: null,
  error: 'Account access is unavailable. Try again shortly.',
};
const AccountContext = createContext<AccountContextValue>({
  controller: null,
  auth: initializing,
  validation: 'none',
  session: null,
  validationGeneration: 0,
  validationError: null,
});

function clearCharacterAttempts(retainKey?: string) {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith('hunter-character-attempt:') && key !== retainKey) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    /* Storage may be unavailable; private state is still isolated in memory. */
  }
}

interface SharedBrowserController {
  consumers: number;
  promise: Promise<AuthController>;
}

let sharedBrowserController: SharedBrowserController | null = null;

function acquireBrowserController(): {
  promise: Promise<AuthController>;
  release: () => void;
} {
  if (!sharedBrowserController) {
    const promise = createBrowserAuthController();
    const shared: SharedBrowserController = {
      consumers: 0,
      promise,
    };
    sharedBrowserController = shared;
  }
  const shared = sharedBrowserController;
  shared.consumers += 1;
  return {
    promise: shared.promise,
    release: () => {
      shared.consumers -= 1;
      queueMicrotask(() => {
        if (sharedBrowserController !== shared || shared.consumers !== 0) return;
        void shared.promise.then(
          (controller) => {
            if (sharedBrowserController !== shared || shared.consumers !== 0) return;
            controller.dispose();
            sharedBrowserController = null;
          },
          () => undefined,
        );
      });
    },
  };
}

function ConnectedAccountProvider({
  controller,
  children,
}: {
  controller: AuthController;
  children: ReactNode;
}) {
  const auth = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const queryClient = useQueryClient();
  const previousAuthUser = useRef<string | null>(null);
  const [validated, setValidated] = useState<{
    token: string | null;
    session: SelfSession | null;
    error: string | null;
    generation: number;
  }>({ token: null, session: null, error: null, generation: 0 });

  useEffect(() => {
    void controller.ready();
  }, [controller]);

  useEffect(() => {
    let active = true;
    void queryClient.cancelQueries({ queryKey: ['character', 'private'] });
    queryClient.removeQueries({ queryKey: ['character', 'private'] });
    const currentUser = auth.phase === 'authenticated' ? (auth.user?.id ?? null) : null;
    if (previousAuthUser.current && previousAuthUser.current !== currentUser) {
      clearCharacterAttempts();
    }
    previousAuthUser.current = currentUser;
    if (!auth.accessToken || auth.phase !== 'authenticated') {
      setValidated((current) => ({
        token: null,
        session: null,
        error: null,
        generation: current.generation + 1,
      }));
      return () => {
        active = false;
      };
    }
    const token = auth.accessToken;
    setValidated((current) => ({
      token,
      session: null,
      error: null,
      generation: current.generation + 1,
    }));
    void getSelfSession(token)
      .then((session) => {
        if (!active) return;
        if (session.authUserId !== auth.user?.id) {
          clearCharacterAttempts();
          setValidated((current) => ({
            ...current,
            token,
            session: null,
            error: 'The account session could not be verified.',
          }));
          return;
        }
        // Token refresh keeps the attempt only for the same validated session.
        // A replacement session, operator routing, or invalid session retains none.
        clearCharacterAttempts(
          session.applicationRole === 'player'
            ? `hunter-character-attempt:${session.authUserId}:${session.sessionId}`
            : undefined,
        );
        setValidated((current) => ({ ...current, token, session, error: null }));
      })
      .catch((error: unknown) => {
        if (!active) return;
        clearCharacterAttempts();
        setValidated((current) => ({
          ...current,
          token,
          session: null,
          error:
            error instanceof AuthActionError
              ? error.message
              : 'The account session could not be verified.',
        }));
      });
    return () => {
      active = false;
    };
  }, [auth.accessToken, auth.phase, auth.user?.id, queryClient]);

  const validation =
    !auth.accessToken || auth.phase !== 'authenticated'
      ? 'none'
      : validated.token !== auth.accessToken || (!validated.session && !validated.error)
        ? 'checking'
        : validated.session
          ? 'valid'
          : 'invalid';
  const value = useMemo<AccountContextValue>(
    () => ({
      controller,
      auth,
      validation,
      session:
        validated.token === auth.accessToken && validation === 'valid' ? validated.session : null,
      validationGeneration: validated.generation,
      validationError: validated.error,
    }),
    [
      auth,
      controller,
      validated.error,
      validated.generation,
      validated.session,
      validated.token,
      validation,
    ],
  );
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<
    | { phase: 'loading'; controller: null }
    | { phase: 'ready'; controller: AuthController }
    | { phase: 'failed'; controller: null }
  >({ phase: 'loading', controller: null });

  useEffect(() => {
    let active = true;
    const acquired = acquireBrowserController();
    void acquired.promise
      .then((controller) => {
        if (active) setState({ phase: 'ready', controller });
      })
      .catch(() => {
        if (active) setState({ phase: 'failed', controller: null });
      });
    return () => {
      active = false;
      acquired.release();
    };
  }, []);

  if (state.phase === 'ready') {
    return (
      <ConnectedAccountProvider controller={state.controller}>{children}</ConnectedAccountProvider>
    );
  }
  return (
    <AccountContext.Provider
      value={{
        controller: null,
        auth: state.phase === 'failed' ? unavailable : initializing,
        validation: 'none',
        session: null,
        validationGeneration: 0,
        validationError: null,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccountAuth(): AccountContextValue {
  return useContext(AccountContext);
}
