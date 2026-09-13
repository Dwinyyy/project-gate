import { useState, type FormEvent } from 'react';
import { Icon, StatusBadge } from '@hunter-world/ui';
import { useOperatorAuth, type OperatorAuthModel } from './useOperatorAuth';
import styles from '../App.module.css';

function SignOutButton({ auth }: { auth: OperatorAuthModel }) {
  return (
    <button
      className={styles.secondaryButton}
      type="button"
      disabled={auth.busy}
      onClick={() => void auth.signOut()}
    >
      Sign out
    </button>
  );
}

function SignIn({ auth }: { auth: OperatorAuthModel }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await auth.signIn(email, password);
    setPassword('');
  }

  return (
    <>
      <StatusBadge tone="warning">Operator access locked</StatusBadge>
      <h1 id="access-title">Operator sign in.</h1>
      <p className={styles.description}>
        Use the provisioned account for this workspace. Operator registration is never available
        here.
      </p>
      <form className={styles.authForm} onSubmit={submit} noValidate>
        <label htmlFor="operator-email">Operator email</label>
        <input
          id="operator-email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={auth.busy}
        />
        <label htmlFor="operator-password">Password</label>
        <input
          id="operator-password"
          type="password"
          autoComplete="current-password"
          minLength={12}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={auth.busy}
        />
        <AuthError message={auth.error} />
        <button className={styles.primaryButton} type="submit" disabled={auth.busy}>
          {auth.busy ? 'Checking…' : 'Continue'}
          <Icon name="arrow" width="16" height="16" />
        </button>
      </form>
    </>
  );
}

function AuthError({ message }: { message: string | null }) {
  return (
    <div className={styles.formMessage} aria-live="polite" aria-atomic="true">
      {message ? <p className={styles.formError}>{message}</p> : null}
    </div>
  );
}

function MfaStep({ auth }: { auth: OperatorAuthModel }) {
  const [code, setCode] = useState('');
  const enrollment = auth.view.phase === 'mfa-enrollment' ? auth.view.enrollment : null;
  const needsEnrollment = auth.view.phase === 'mfa-enrollment' && !enrollment;

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await auth.verify(code);
    setCode('');
  }

  return (
    <>
      <StatusBadge tone="warning">AAL2 required</StatusBadge>
      <h1 id="access-title">
        {needsEnrollment ? 'Add an authenticator.' : 'Enter your authenticator code.'}
      </h1>
      <p className={styles.description}>
        {needsEnrollment
          ? 'Operator access requires a time-based one-time password in addition to your account password.'
          : 'Enter the current six-digit code. Password authentication alone cannot open this workspace.'}
      </p>
      {needsEnrollment ? (
        <button
          className={styles.primaryButton}
          type="button"
          disabled={auth.busy}
          onClick={() => void auth.beginEnrollment()}
        >
          {auth.busy ? 'Preparing…' : 'Set up authenticator'}
          <Icon name="shield" width="17" height="17" />
        </button>
      ) : (
        <form className={styles.authForm} onSubmit={verify} noValidate>
          {enrollment ? (
            <div className={styles.enrollment}>
              <img src={enrollment.qrCode} alt="Authenticator enrollment QR code" />
              <div>
                <span>Manual setup key</span>
                <code>{enrollment.secret}</code>
              </div>
            </div>
          ) : null}
          <label htmlFor="operator-code">Six-digit code</label>
          <input
            id="operator-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="[0-9]{6}"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            disabled={auth.busy}
          />
          <AuthError message={auth.error} />
          <button className={styles.primaryButton} type="submit" disabled={auth.busy}>
            {auth.busy ? 'Verifying…' : 'Verify authenticator'}
            <Icon name="shield" width="17" height="17" />
          </button>
        </form>
      )}
      {needsEnrollment ? <AuthError message={auth.error} /> : null}
      <div className={styles.sessionAction}>
        <SignOutButton auth={auth} />
      </div>
    </>
  );
}

function BoundaryState({ auth }: { auth: OperatorAuthModel }) {
  const checking = auth.view.phase === 'initializing' || auth.view.phase === 'authorization-check';
  const denied = auth.view.phase === 'denied';
  const message =
    auth.view.phase === 'denied' || auth.view.phase === 'unavailable'
      ? auth.view.message
      : 'Validating the account, authenticator assurance, and current operator record.';
  return (
    <>
      <StatusBadge tone={denied ? 'warning' : 'muted'}>
        {checking ? 'Authorization check' : denied ? 'Access denied' : 'Unavailable'}
      </StatusBadge>
      <h1 id="access-title">
        {checking
          ? 'Checking operator authorization…'
          : denied
            ? 'Operator access denied.'
            : 'Operator authentication unavailable.'}
      </h1>
      <p className={styles.description} aria-live="polite">
        {message}
      </p>
      {!checking ? (
        <div className={styles.sessionAction}>
          <SignOutButton auth={auth} />
        </div>
      ) : null}
    </>
  );
}

function Authorized({ auth }: { auth: OperatorAuthModel }) {
  if (auth.view.phase !== 'authorized') return null;
  return (
    <>
      <StatusBadge tone="positive">AAL2 · Authorized</StatusBadge>
      <h1 id="access-title">Operator session authorized.</h1>
      <p className={styles.description}>
        The current account, AAL2 authenticator assurance, and active operator record were all
        confirmed by the service.
      </p>
      <dl className={styles.operatorSession}>
        <div>
          <dt>Account</dt>
          <dd>{auth.email ?? 'Confirmed operator'}</dd>
        </div>
        <div>
          <dt>Assurance</dt>
          <dd>AAL2</dd>
        </div>
      </dl>
      <div className={styles.permissions}>
        <span>Granted permissions</span>
        <ul>
          {auth.view.session.permissions.map((permission) => (
            <li key={permission}>{permission}</li>
          ))}
        </ul>
      </div>
      <div className={styles.boundary}>
        <Icon name="lock" width="18" height="18" />
        <p>Administrative tools remain unavailable in this task.</p>
      </div>
      <div className={styles.sessionAction}>
        <SignOutButton auth={auth} />
      </div>
    </>
  );
}

export function OperatorAuth() {
  const auth = useOperatorAuth();
  const showsMfa = auth.view.phase === 'mfa-enrollment' || auth.view.phase === 'mfa-challenge';
  return (
    <section className={styles.lockPanel} aria-labelledby="access-title">
      <div className={styles.lockIllustration} aria-hidden="true">
        <div />
        <Icon name="shield" width="40" height="40" />
      </div>
      {auth.view.phase === 'anonymous' ? (
        <SignIn auth={auth} />
      ) : showsMfa ? (
        <MfaStep auth={auth} />
      ) : auth.view.phase === 'authorized' ? (
        <Authorized auth={auth} />
      ) : (
        <BoundaryState auth={auth} />
      )}
      <div className={styles.panelFooter}>
        <span>PHASE 2 · ACCOUNT AUTH</span>
        <span>Two independent gates required</span>
      </div>
    </section>
  );
}
