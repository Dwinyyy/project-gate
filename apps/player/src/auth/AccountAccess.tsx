import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthActionError } from '@hunter-world/client';
import { Icon } from '@hunter-world/ui';
import { useAccountAuth } from './AuthProvider';
import styles from '../App.module.css';

function safeMessage(error: unknown): string {
  return error instanceof AuthActionError
    ? error.message
    : 'Account access is unavailable. Try again shortly.';
}

export function AccountAccess({ mode }: { mode: 'sign-in' | 'register' }) {
  const { controller, auth } = useAccountAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState: unknown = location.state;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const registering = mode === 'register';
  const passwordUpdated =
    !registering &&
    routeState !== null &&
    typeof routeState === 'object' &&
    'notice' in routeState &&
    routeState.notice === 'password-updated';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setError(null);
    if (registering && password !== confirmation) {
      setError('The password confirmation does not match.');
      return;
    }
    setBusy(true);
    try {
      if (!controller) {
        throw new AuthActionError('unavailable', auth.error ?? 'Account access is loading.');
      }
      if (registering) {
        await controller.signUp(email, password, `${window.location.origin}/auth/callback`);
        setPassword('');
        setConfirmation('');
        setNotice('Check your email to verify this account.');
      } else {
        await controller.signIn(email, password);
        setPassword('');
        navigate('/');
      }
    } catch (submitError) {
      setPassword('');
      setConfirmation('');
      setError(safeMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.accountPanel} aria-labelledby="account-title">
      <div className={styles.accountIcon} aria-hidden="true">
        <Icon name={registering ? 'identity' : 'lock'} width="30" height="30" />
      </div>
      <p className={styles.eyebrow}>{registering ? 'BEGIN YOUR RECORD' : 'RETURN TO THE SYSTEM'}</p>
      <h1 id="account-title">
        {registering ? 'Create your account.' : 'Sign in to your account.'}
      </h1>
      <p className={styles.accountLead}>
        {registering
          ? 'Account access comes first. Your in-world character is created separately when creation is available for your account.'
          : 'Sign in to retrieve your confirmed account session.'}
      </p>
      {passwordUpdated ? (
        <p className={styles.formSuccess} role="status">
          Your password has been updated. Sign in with your new password.
        </p>
      ) : null}
      <form className={styles.accountForm} onSubmit={submit} noValidate>
        <label htmlFor="account-email">Email address</label>
        <input
          id="account-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={busy}
        />
        <label htmlFor="account-password">Password</label>
        <input
          id="account-password"
          name="password"
          type="password"
          autoComplete={registering ? 'new-password' : 'current-password'}
          minLength={12}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={busy}
        />
        <p className={styles.fieldHint}>Use at least 12 characters.</p>
        {registering ? (
          <>
            <label htmlFor="account-confirmation">Confirm password</label>
            <input
              id="account-confirmation"
              name="password-confirmation"
              type="password"
              autoComplete="new-password"
              minLength={12}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={busy}
            />
          </>
        ) : null}
        <div className={styles.formMessage} aria-live="polite" aria-atomic="true">
          {error ? <p className={styles.formError}>{error}</p> : null}
          {notice ? <p className={styles.formSuccess}>{notice}</p> : null}
        </div>
        <button className={styles.accountPrimaryButton} type="submit" disabled={busy}>
          {busy ? 'Working…' : registering ? 'Create account' : 'Sign in'}
          <Icon name="arrow" width="16" height="16" />
        </button>
      </form>
      <div className={styles.accountLinks}>
        {registering ? (
          <Link to="/account/sign-in">Already registered? Sign in</Link>
        ) : (
          <>
            <Link to="/account/register">Create an account</Link>
            <Link to="/account/recovery">Forgot your password?</Link>
          </>
        )}
      </div>
      <div className={styles.accountBoundary}>
        <Icon name="shield" width="17" height="17" />
        <p>
          Signing in proves account access only. Game authority comes from current server state.
        </p>
      </div>
    </section>
  );
}
