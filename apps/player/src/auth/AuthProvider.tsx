import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
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
  validationError: null,
});

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
  const [validated, setValidated] = useState<{
    token: string | null;
    session: SelfSession | null;
    error: string | null;
  }>({ token: null, session: null, error: null });

  useEffect(() => {
    void controller.ready();
  }, [controller]);

  useEffect(() => {
    let active = true;
    if (!auth.accessToken) {
      setValidated({ token: null, session: null, error: null });
      return () => {
        active = false;
      };
    }
    const token = auth.accessToken;
    setValidated({ token, session: null, error: null });
    void getSelfSession(token)
      .then((session) => {
        if (!active) return;
        if (session.authUserId !== auth.user?.id) {
          setValidated({
            token,
            session: null,
            error: 'The account session could not be verified.',
          });
          return;
        }
        setValidated({ token, session, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setValidated({
          token,
          session: null,
          error:
            error instanceof AuthActionError
              ? error.message
              : 'The account session could not be verified.',
        });
      });
    return () => {
      active = false;
    };
  }, [auth.accessToken, auth.user?.id]);

  const validation = !auth.accessToken
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
      session: validated.session,
      validationError: validated.error,
    }),
    [auth, controller, validated.error, validated.session, validation],
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
