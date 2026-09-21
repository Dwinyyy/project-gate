import { useState, type FormEvent } from 'react';
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

export function Recovery() {
  const { controller, auth } = useAccountAuth();
  const navigate = useNavigate();
  const changingPassword = auth.phase === 'recovery';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      if (!controller) {
        throw new AuthActionError('unavailable', auth.error ?? 'Account access is loading.');
      }
      if (changingPassword) {
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
      setError(safeMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

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
      <h1 id="recovery-title">
        {changingPassword ? 'Choose a new password.' : 'Recover your account.'}
      </h1>
      <p className={styles.accountLead}>
        {changingPassword
          ? 'Set a new password for the account linked to this recovery session.'
          : 'We will send a time-limited recovery link if this email belongs to an account.'}
      </p>
      <form className={styles.accountForm} onSubmit={submit} noValidate>
        {changingPassword ? (
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
          {busy ? 'Working…' : changingPassword ? 'Update password' : 'Send recovery link'}
          <Icon name="arrow" width="16" height="16" />
        </button>
      </form>
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
