import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthActionError } from '@hunter-world/client';
import { Icon } from '@hunter-world/ui';
import { useAccountAuth } from './AuthProvider';
import styles from '../App.module.css';

function safeMessage(error: unknown): string {
  return error instanceof AuthActionError
    ? error.message
    : 'Account recovery is unavailable. Try again shortly.';
}

function recoverySessionKey(accessToken: string | null): string {
  if (!accessToken) return 'anonymous';
  const payload = accessToken.split('.')[1];
  if (!payload || !/^[A-Za-z0-9_-]+$/.test(payload)) return accessToken;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims: unknown = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
    if (claims && typeof claims === 'object') {
      const record = claims as Record<string, unknown>;
      if (typeof record.sub === 'string' && typeof record.session_id === 'string') {
        // This key only separates local form state. The provider and API still authorize actions.
        return `${record.sub}:${record.session_id}`;
      }
    }
  } catch {
    // Malformed tokens still get an isolated form instance.
  }
  return accessToken;
}

export function Recovery() {
  const { auth } = useAccountAuth();
  const sessionKey = useRef(recoverySessionKey(auth.accessToken));
  if (auth.accessToken) sessionKey.current = recoverySessionKey(auth.accessToken);
  return <RecoverySession key={sessionKey.current} />;
}

function RecoverySession() {
  const { controller, auth } = useAccountAuth();
  const navigate = useNavigate();
  const changingPassword = auth.phase === 'recovery';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [authenticatorCode, setAuthenticatorCode] = useState('');
  const [mfaCheckState, setMfaCheck] = useState<
    | { phase: 'idle' | 'checking' | 'error' | 'password' }
    | { phase: 'challenge'; factorIds: string[]; factorId: string }
  >({ phase: 'idle' });
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const mfaCheck =
    changingPassword && mfaToken !== auth.accessToken
      ? ({ phase: 'checking' } as const)
      : mfaCheckState;
  const [mfaCheckRevision, setMfaCheckRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!changingPassword) {
      setMfaCheck({ phase: 'idle' });
      return () => {
        active = false;
      };
    }
    if (!controller) {
      setMfaCheck({ phase: 'error' });
      setError(auth.error ?? 'Account access is loading.');
      return () => {
        active = false;
      };
    }
    setMfaCheck({ phase: 'checking' });
    setMfaToken(auth.accessToken);
    setError(null);
    void controller
      .getRecoveryMfaStatus()
      .then((status) => {
        if (!active) return;
        if (status.assurance === 'aal1' && status.verifiedTotpFactorIds.length > 0) {
          setMfaCheck({
            phase: 'challenge',
            factorIds: status.verifiedTotpFactorIds,
            factorId: status.verifiedTotpFactorIds[0]!,
          });
          return;
        }
        setMfaCheck({ phase: 'password' });
      })
      .catch((checkError: unknown) => {
        if (!active) return;
        setMfaCheck({ phase: 'error' });
        setError(safeMessage(checkError));
      });
    return () => {
      active = false;
    };
  }, [auth.accessToken, auth.error, changingPassword, controller, mfaCheckRevision]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      if (!controller) {
        throw new AuthActionError('unavailable', auth.error ?? 'Account access is loading.');
      }
      if (changingPassword && mfaCheck.phase === 'challenge') {
        await controller.verifyRecoveryTotp(mfaCheck.factorId, authenticatorCode);
        setAuthenticatorCode('');
        setNotice('Authenticator verified. Choose a new password.');
      } else if (changingPassword && mfaCheck.phase === 'password') {
        if (password !== confirmation) {
          throw new AuthActionError('invalid_input', 'The password confirmation does not match.');
        }
        await controller.updatePassword(password);
        setPassword('');
        setConfirmation('');
        navigate('/account/sign-in', { replace: true, state: { notice: 'password-updated' } });
      } else {
        await controller.requestPasswordRecovery(
          email,
          `${window.location.origin}/account/recovery`,
        );
        setNotice('If the account exists, a recovery link is on its way.');
      }
    } catch (submitError) {
      setPassword('');
      setConfirmation('');
      setAuthenticatorCode('');
      setError(safeMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  const recoveryHeading =
    mfaCheck.phase === 'checking'
      ? 'Checking recovery security.'
      : mfaCheck.phase === 'error'
        ? 'Recovery verification unavailable.'
        : mfaCheck.phase === 'challenge'
          ? 'Authenticator verification required.'
          : 'Choose a new password.';
  const recoveryLead =
    mfaCheck.phase === 'checking'
      ? 'Checking whether this account requires an authenticator code.'
      : mfaCheck.phase === 'error'
        ? 'The recovery security check did not finish. Try it again before changing the password.'
        : mfaCheck.phase === 'challenge'
          ? 'Enter a current code from an authenticator already enrolled on this account.'
          : 'Set a new password for the account linked to this recovery session.';

  async function cancelRecovery() {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      if (!controller) {
        throw new AuthActionError('unavailable', auth.error ?? 'Account access is loading.');
      }
      await controller.signOut();
      navigate('/account/sign-in', { replace: true });
    } catch (cancelError) {
      setError(safeMessage(cancelError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.accountPanel} aria-labelledby="recovery-title">
      <div className={styles.accountIcon} aria-hidden="true">
        <Icon name="refresh" width="30" height="30" />
      </div>
      <p className={styles.eyebrow}>ACCOUNT RECOVERY</p>
      <h1 id="recovery-title">{changingPassword ? recoveryHeading : 'Recover your account.'}</h1>
      <p className={styles.accountLead}>
        {changingPassword
          ? recoveryLead
          : 'We will send a time-limited recovery link if this email belongs to an account.'}
      </p>
      {mfaCheck.phase === 'error' && changingPassword ? (
        <button
          className={styles.accountPrimaryButton}
          type="button"
          disabled={busy}
          onClick={() => setMfaCheckRevision((revision) => revision + 1)}
        >
          Try security check again
          <Icon name="refresh" width="16" height="16" />
        </button>
      ) : null}
      {(!changingPassword || mfaCheck.phase === 'challenge' || mfaCheck.phase === 'password') && (
        <form className={styles.accountForm} onSubmit={submit} noValidate>
          {mfaCheck.phase === 'challenge' && changingPassword ? (
            <>
              {mfaCheck.factorIds.length > 1 ? (
                <>
                  <label htmlFor="recovery-factor">Authenticator</label>
                  <select
                    id="recovery-factor"
                    value={mfaCheck.factorId}
                    onChange={(event) => setMfaCheck({ ...mfaCheck, factorId: event.target.value })}
                    disabled={busy}
                  >
                    {mfaCheck.factorIds.map((factorId, index) => (
                      <option key={factorId} value={factorId}>
                        Authenticator {index + 1}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
              <label htmlFor="recovery-authenticator-code">Authenticator code</label>
              <input
                id="recovery-authenticator-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={authenticatorCode}
                onChange={(event) => setAuthenticatorCode(event.target.value.trim())}
                disabled={busy}
              />
            </>
          ) : changingPassword ? (
            <>
              <label htmlFor="recovery-password">New password</label>
              <input
                id="recovery-password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
              />
              <label htmlFor="recovery-confirmation">Confirm new password</label>
              <input
                id="recovery-confirmation"
                type="password"
                autoComplete="new-password"
                minLength={12}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                disabled={busy}
              />
            </>
          ) : (
            <>
              <label htmlFor="recovery-email">Email address</label>
              <input
                id="recovery-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={busy}
              />
            </>
          )}
          <div className={styles.formMessage} aria-live="polite" aria-atomic="true">
            {error ? <p className={styles.formError}>{error}</p> : null}
            {notice ? <p className={styles.formSuccess}>{notice}</p> : null}
          </div>
          <button className={styles.accountPrimaryButton} type="submit" disabled={busy}>
            {busy
              ? 'Working…'
              : mfaCheck.phase === 'challenge' && changingPassword
                ? 'Verify authenticator'
                : changingPassword
                  ? 'Update password'
                  : 'Send recovery link'}
            <Icon name="arrow" width="16" height="16" />
          </button>
        </form>
      )}
      {mfaCheck.phase === 'checking' || (mfaCheck.phase === 'error' && changingPassword) ? (
        <div className={styles.formMessage} aria-live="polite" aria-atomic="true">
          {error ? <p className={styles.formError}>{error}</p> : null}
        </div>
      ) : null}
      <div className={styles.accountLinks}>
        {changingPassword ? (
          <button
            className={styles.textButton}
            type="button"
            disabled={busy}
            onClick={() => void cancelRecovery()}
          >
            Cancel recovery and sign out
          </button>
        ) : (
          <Link to="/account/sign-in">Return to sign in</Link>
        )}
      </div>
    </section>
  );
}
