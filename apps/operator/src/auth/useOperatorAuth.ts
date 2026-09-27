import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AuthActionError,
  createBrowserAuthController,
  getOperatorSession,
  getSelfSession,
  type AuthController,
  type AuthSnapshot,
  type TotpEnrollment,
} from '@hunter-world/client';

type OperatorSession = Awaited<ReturnType<typeof getOperatorSession>>;

export type OperatorAuthView =
  | { phase: 'initializing' }
  | { phase: 'redirect'; to: '/account/sign-in' | '/account/recovery' | '/' }
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
  beginEnrollment(): Promise<void>;
  verify(code: string): Promise<void>;
  retryVerification(): void;
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
  const [viewToken, setViewToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const processedToken = useRef<string | null>(null);
  const revision = useRef(0);
  const signOutPending = useRef(false);
  const signOutFailed = useRef(false);
  const [verificationAttempt, setVerificationAttempt] = useState(0);
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
      setViewToken(null);
      if (signOutFailed.current) return;
      setView(
        signOutPending.current
          ? { phase: 'authorization-check' }
          : { phase: 'redirect', to: '/account/sign-in' },
      );
      setError(null);
      return;
    }
    if (authPhase === 'recovery' || authPhase === 'restricted') {
      revision.current += 1;
      processedToken.current = null;
      setViewToken(token);
      setView({
        phase: 'redirect',
        to: authPhase === 'recovery' ? '/account/recovery' : '/account/sign-in',
      });
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
    signOutFailed.current = false;
    if (processedToken.current === token) return;
    processedToken.current = token;
    setViewToken(token);
    const operation = ++revision.current;
    setError(null);
    setView({ phase: 'authorization-check' });
    void getSelfSession(token)
      .then(async (self) => {
        if (operation !== revision.current) return;
        if (
          self.authUserId !== authUserId ||
          self.applicationRole !== 'operator' ||
          !self.emailVerified
        ) {
          setView({ phase: 'redirect', to: '/' });
          return;
        }
        const status = await controller.getMfaStatus();
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
        if (
          cause instanceof AuthActionError &&
          [
            'operator_access_denied',
            'password_sign_in_required',
            'password_update_required',
            'unauthenticated',
          ].includes(cause.code)
        ) {
          if (cause.code === 'operator_access_denied') {
            setView({ phase: 'redirect', to: '/' });
            return;
          }
          if (cause.code === 'unauthenticated') {
            setView({ phase: 'redirect', to: '/account/sign-in' });
            return;
          }
          setView({ phase: 'denied', message: cause.message });
          return;
        }
        setView({ phase: 'unavailable', message: safeActionMessage(cause) });
      });
  }, [accessToken, authError, authPhase, authUserId, controller, verificationAttempt]);

  const retryVerification = useCallback(() => {
    revision.current += 1;
    processedToken.current = null;
    setVerificationAttempt((attempt) => attempt + 1);
  }, []);

  const beginEnrollment = useCallback(async () => {
    const originatingToken = controller?.getSnapshot().accessToken;
    setBusy(true);
    setError(null);
    try {
      if (!controller) {
        throw new AuthActionError('unavailable', 'Operator authentication is unavailable.');
      }
      const enrollment = await controller.enrollTotp();
      if (controller.getSnapshot().accessToken !== originatingToken) return;
      setView({ phase: 'mfa-enrollment', enrollment });
    } catch (cause) {
      if (controller?.getSnapshot().accessToken !== originatingToken) return;
      setView({ phase: 'mfa-enrollment', enrollment: null });
      setError(safeActionMessage(cause));
    } finally {
      setBusy(false);
    }
  }, [controller]);

  const verify = useCallback(
    async (code: string) => {
      const originatingToken = controller?.getSnapshot().accessToken;
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
      } catch (cause) {
        if (controller?.getSnapshot().accessToken !== originatingToken) return;
        if (factorId) setView({ phase: 'mfa-challenge', factorId });
        setError(safeActionMessage(cause));
      } finally {
        setBusy(false);
      }
    },
    [controller, view],
  );

  const signOut = useCallback(async () => {
    if (!controller) {
      setView({ phase: 'redirect', to: '/account/sign-in' });
      return;
    }
    const originatingToken = controller?.getSnapshot().accessToken;
    revision.current += 1;
    processedToken.current = null;
    signOutPending.current = true;
    signOutFailed.current = false;
    setBusy(true);
    setError(null);
    setView({ phase: 'authorization-check' });
    try {
      await controller.signOut();
      signOutPending.current = false;
      if (controller?.getSnapshot().phase === 'anonymous') {
        setView({ phase: 'redirect', to: '/account/sign-in' });
      } else {
        retryVerification();
      }
    } catch (cause) {
      signOutPending.current = false;
      const currentToken = controller?.getSnapshot().accessToken;
      if (currentToken && currentToken !== originatingToken) return;
      signOutFailed.current = true;
      setView({
        phase: 'denied',
        message:
          cause instanceof AuthActionError
            ? cause.message
            : 'Sign-out confirmation is unavailable. Close this browser before leaving.',
      });
    } finally {
      setBusy(false);
    }
  }, [controller, retryVerification]);

  return {
    view:
      (view.phase === 'redirect' && authPhase === 'authenticated' && viewToken !== accessToken) ||
      ((view.phase === 'authorized' ||
        view.phase === 'mfa-enrollment' ||
        view.phase === 'mfa-challenge') &&
        (authPhase !== 'authenticated' || viewToken !== accessToken))
        ? { phase: 'authorization-check' }
        : view,
    email: auth.user?.email ?? null,
    busy,
    error,
    beginEnrollment,
    verify,
    retryVerification,
    signOut,
  };
}
