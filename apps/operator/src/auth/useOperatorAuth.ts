import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AuthActionError,
  createBrowserAuthController,
  getOperatorSession,
  type AuthController,
  type AuthSnapshot,
  type TotpEnrollment,
} from '@hunter-world/client';

type OperatorSession = Awaited<ReturnType<typeof getOperatorSession>>;

export type OperatorAuthView =
  | { phase: 'initializing' }
  | { phase: 'anonymous' }
  | { phase: 'mfa-enrollment'; enrollment: TotpEnrollment | null }
  | { phase: 'mfa-challenge'; factorId: string }
  | { phase: 'authorization-check' }
  | { phase: 'authorized'; session: OperatorSession }
  | { phase: 'denied'; message: string }
  | { phase: 'unavailable'; message: string };

export interface OperatorAuthModel {
  view: OperatorAuthView;
  email: string | null;
  busy: boolean;
  error: string | null;
  signIn(email: string, password: string): Promise<void>;
  beginEnrollment(): Promise<void>;
  verify(code: string): Promise<void>;
  signOut(): Promise<void>;
}

interface SharedController {
  consumers: number;
  promise: Promise<AuthController>;
}

let sharedController: SharedController | null = null;

function acquireController(): { promise: Promise<AuthController>; release: () => void } {
  if (!sharedController) {
    sharedController = { consumers: 0, promise: createBrowserAuthController() };
  }
  const shared = sharedController;
  shared.consumers += 1;
  return {
    promise: shared.promise,
    release: () => {
      shared.consumers -= 1;
      queueMicrotask(() => {
        if (sharedController !== shared || shared.consumers !== 0) return;
        void shared.promise.then(
          (controller) => {
            if (sharedController !== shared || shared.consumers !== 0) return;
            controller.dispose();
            sharedController = null;
          },
          () => undefined,
        );
      });
    },
  };
}

const initializingAuth: AuthSnapshot = {
  phase: 'initializing',
  user: null,
  accessToken: null,
  error: null,
};

function safeActionMessage(error: unknown): string {
  return error instanceof AuthActionError
    ? error.message
    : 'Operator authentication is unavailable. Try again shortly.';
}

export function useOperatorAuth(): OperatorAuthModel {
  const [controller, setController] = useState<AuthController | null>(null);
  const [auth, setAuth] = useState<AuthSnapshot>(initializingAuth);
  const [view, setView] = useState<OperatorAuthView>({ phase: 'initializing' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const processedToken = useRef<string | null>(null);
  const revision = useRef(0);
  const authPhase = auth.phase;
  const accessToken = auth.accessToken;
  const authError = auth.error;
  const authUserId = auth.user?.id;

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => undefined;
    const acquired = acquireController();
    void acquired.promise
      .then((nextController) => {
        if (!active) return;
        setController(nextController);
        const update = () => {
          if (active) setAuth(nextController.getSnapshot());
        };
        unsubscribe = nextController.subscribe(update);
        update();
        void nextController.ready().then(update);
      })
      .catch(() => {
        if (!active) return;
        setView({
          phase: 'unavailable',
          message: 'Operator authentication is unavailable. Try again shortly.',
        });
      });
    return () => {
      active = false;
      unsubscribe();
      acquired.release();
    };
  }, []);

  useEffect(() => {
    const token = accessToken;
    if (authPhase === 'initializing') return;
    if (authPhase === 'anonymous') {
      revision.current += 1;
      processedToken.current = null;
      setView({ phase: 'anonymous' });
      setError(null);
      return;
    }
    if (authPhase === 'unavailable' || !controller || !token || !authUserId) {
      revision.current += 1;
      processedToken.current = null;
      setView({
        phase: 'unavailable',
        message: authError ?? 'The operator session could not be confirmed.',
      });
      return;
    }
    if (processedToken.current === token) return;
    processedToken.current = token;
    const operation = ++revision.current;
    setError(null);
    setView({ phase: 'authorization-check' });
    void controller
      .getMfaStatus()
      .then(async (status) => {
        if (operation !== revision.current) return;
        if (status.assurance === 'unenrolled') {
          setView({ phase: 'mfa-enrollment', enrollment: null });
          return;
        }
        const factorId = status.verifiedTotpFactorIds[0];
        if (status.assurance === 'aal1') {
          if (!factorId) {
            setView({
              phase: 'unavailable',
              message: 'No verified authenticator is available for this operator session.',
            });
            return;
          }
          setView({ phase: 'mfa-challenge', factorId });
          return;
        }
        const session = await getOperatorSession(token);
        if (operation !== revision.current) return;
        if (session.authUserId !== authUserId) {
          setView({
            phase: 'denied',
            message: 'The operator identity could not be confirmed.',
          });
          return;
        }
        setView({ phase: 'authorized', session });
      })
      .catch((cause: unknown) => {
        if (operation !== revision.current) return;
        if (cause instanceof AuthActionError && cause.code === 'operator_access_denied') {
          setView({ phase: 'denied', message: cause.message });
          return;
        }
        setView({ phase: 'unavailable', message: safeActionMessage(cause) });
      });
  }, [accessToken, authError, authPhase, authUserId, controller]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setBusy(true);
      setError(null);
      try {
        if (!controller) {
          throw new AuthActionError('unavailable', 'Operator authentication is still loading.');
        }
        await controller.signIn(email, password);
      } catch (cause) {
        setError(safeActionMessage(cause));
      } finally {
        setBusy(false);
      }
    },
    [controller],
  );

  const beginEnrollment = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (!controller) {
        throw new AuthActionError('unavailable', 'Operator authentication is unavailable.');
      }
      const enrollment = await controller.enrollTotp();
      setView({ phase: 'mfa-enrollment', enrollment });
    } catch (cause) {
      setView({ phase: 'mfa-enrollment', enrollment: null });
      setError(safeActionMessage(cause));
    } finally {
      setBusy(false);
    }
  }, [controller]);

  const verify = useCallback(
    async (code: string) => {
      const factorId =
        view.phase === 'mfa-enrollment'
          ? view.enrollment?.factorId
          : view.phase === 'mfa-challenge'
            ? view.factorId
            : undefined;
      setBusy(true);
      setError(null);
      try {
        if (!controller || !factorId) {
          throw new AuthActionError(
            'unavailable',
            'The authenticator challenge is unavailable. Sign in again.',
          );
        }
        await controller.verifyTotp(factorId, code);
        setView({ phase: 'authorization-check' });
      } catch (cause) {
        if (factorId) setView({ phase: 'mfa-challenge', factorId });
        setError(safeActionMessage(cause));
      } finally {
        setBusy(false);
      }
    },
    [controller, view],
  );

  const signOut = useCallback(async () => {
    revision.current += 1;
    processedToken.current = null;
    setBusy(true);
    setError(null);
    setView({ phase: 'anonymous' });
    try {
      if (controller) await controller.signOut();
    } catch {
      setView({
        phase: 'denied',
        message: 'Sign-out confirmation is unavailable. Close this browser before leaving.',
      });
    } finally {
      setBusy(false);
    }
  }, [controller]);

  return {
    view,
    email: auth.user?.email ?? null,
    busy,
    error,
    signIn,
    beginEnrollment,
    verify,
    signOut,
  };
}
