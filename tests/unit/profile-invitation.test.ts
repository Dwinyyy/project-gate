import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement, StrictMode } from 'react';
import {
  buildProfileInvitationLink,
  captureInitialProfileInvitation,
  createProfileInvitationMemory,
  parseProfileInvitationLink,
} from '../../apps/player/src/profile/profileInvitation';
import {
  ProfileInvitationProvider,
  useProfileInvitation,
} from '../../apps/player/src/profile/ProfileInvitationProvider';

const token = 'A'.repeat(43);
const origin = 'https://hunter.example';
const link = `${origin}/profile-invitation#token=${token}`;

describe('profile invitation landing', () => {
  it('accepts only the exact canonical same-origin link', () => {
    expect(parseProfileInvitationLink(link, origin)).toBe(token);
    expect(buildProfileInvitationLink(origin, token)).toBe(link);
    for (const invalid of [
      link.replace(origin, 'https://foreign.example'),
      link.replace(origin, `${origin}:444`),
      link.replace('hunter.example', 'user@hunter.example'),
      link.replace('/profile-invitation', '/profile-invitation/'),
      link.replace('/profile-invitation', '/other/../profile-invitation'),
      link.replace('/profile-invitation', '/%70rofile-invitation'),
      link.replace('#', '?returnTo=/other#'),
      `${link}&token=${token}`,
      `${link}&returnTo=/other`,
      `${link}%26x=y`,
      link.replace('token=', '%74oken='),
      link.replace(token, 'B'.repeat(43)),
      link.replace(token, 'A'.repeat(42)),
      link.replace(token, 'A'.repeat(44)),
      `/profile-invitation#token=${token}`,
    ])
      expect(parseProfileInvitationLink(invalid, origin)).toBeNull();
  });

  it('strips landing secrets and malicious masked history synchronously', () => {
    const history = { state: { masked: { hash: `#token=${token}` } }, replaceState: vi.fn() };
    const location = new URL(link);
    expect(
      captureInitialProfileInvitation(
        location as unknown as Location,
        history as unknown as History,
      ),
    ).toBe(token);
    expect(history.replaceState).toHaveBeenCalledExactlyOnceWith(null, '', '/profile-invitation');
  });

  it('also strips invalid query and fragment on the exact landing', () => {
    const history = { replaceState: vi.fn() };
    const location = new URL(`${origin}/profile-invitation?token=${token}#bad`);
    expect(
      captureInitialProfileInvitation(
        location as unknown as Location,
        history as unknown as History,
      ),
    ).toBeNull();
    expect(history.replaceState).toHaveBeenCalledExactlyOnceWith(null, '', '/profile-invitation');
  });

  it('preserves unrelated verification and recovery callback hashes', () => {
    for (const path of ['/auth/callback', '/account/recovery', '/']) {
      const history = { replaceState: vi.fn() };
      const location = new URL(`${origin}${path}#access_token=synthetic&type=recovery`);
      expect(
        captureInitialProfileInvitation(
          location as unknown as Location,
          history as unknown as History,
        ),
      ).toBeNull();
      expect(history.replaceState).not.toHaveBeenCalled();
    }
  });

  it('anonymous_scan_survives_first_validated_signin', () => {
    const memory = createProfileInvitationMemory(token);
    expect(memory.getSnapshot()).toEqual({ token, boundReader: null });
    expect(memory.bindReader('A:session')).toBe(true);
    expect(memory.getSnapshot()).toEqual({ token, boundReader: 'A:session' });
  });

  it('clear_survives_provider_remount_and_new_reader', () => {
    const memory = createProfileInvitationMemory(token);
    memory.bindReader('A:session');
    memory.clear();
    function Reader() {
      const invitation = useProfileInvitation();
      return invitation.token ?? 'rescan';
    }
    for (let mount = 0; mount < 2; mount++) {
      expect(
        renderToString(
          createElement(
            StrictMode,
            null,
            createElement(ProfileInvitationProvider, { memory, children: createElement(Reader) }),
          ),
        ),
      ).toBe('rescan');
    }
    memory.bindReader('B:session');
    expect(memory.getSnapshot().token).toBeNull();
    expect(memory.captureLink(link, origin)).toBe(true);
    expect(memory.bindReader('B:session')).toBe(true);
    expect(memory.getSnapshot().token).toBe(token);
  });

  it('replacement readers destroy a bound scan and invalid paste retains no input', () => {
    const memory = createProfileInvitationMemory(token);
    memory.bindReader('A:session');
    expect(memory.bindReader('B:session')).toBe(false);
    expect(memory.getSnapshot()).toEqual({ token: null, boundReader: null });
    expect(memory.captureLink('not a link', origin)).toBe(false);
    expect(memory.getSnapshot().token).toBeNull();
  });
});
