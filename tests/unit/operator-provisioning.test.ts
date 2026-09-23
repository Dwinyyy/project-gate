import { describe, expect, it } from 'vitest';
import { prepareOperatorStatusChange } from '../../scripts/lib/operator-provisioning.js';

const request = {
  requestId: '11111111-1111-4111-8111-111111111111',
  authUserId: '22222222-2222-4222-8222-222222222222',
  status: 'active',
  requestedBy: 'project-owner',
  reason: 'Designated development operator MFA acceptance',
};

describe('operator provisioning request preparation', () => {
  it('prepares only the reviewed operator-status command and retains retry identity', () => {
    const sql = prepareOperatorStatusChange(request);
    expect(sql).toContain('SELECT ops.set_operator_status(');
    expect(sql).toContain(request.requestId);
    expect(sql).toContain(request.authUserId);
    expect(prepareOperatorStatusChange(request)).toBe(sql);
  });

  it.each([
    { ...request, requestId: 'not-a-uuid' },
    { ...request, authUserId: 'all-users' },
    { ...request, status: 'administrator' },
    { ...request, status: ['active'] },
    { ...request, requestedBy: ' ' },
    { ...request, reason: '' },
    { ...request, reason: 'x'.repeat(501) },
    { ...request, reason: 'a\u0000b' },
    { ...request, permissions: ['everything:write'] },
    null,
  ])('rejects malformed, unattributable or broader requests before generating SQL', (value) => {
    expect(() => prepareOperatorStatusChange(value)).toThrow('Invalid operator status request');
  });
});
