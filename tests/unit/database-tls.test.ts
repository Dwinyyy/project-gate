import { expect, it } from 'vitest';
import { databaseTls, parseEnvironment } from '../../packages/server/src/index.js';

it('requires verification when TLS uses system roots', async () => {
  expect(await databaseTls(parseEnvironment({ DATABASE_SSL: 'true' }))).toEqual({
    rejectUnauthorized: true,
  });
});
it('fails closed when the configured certificate is missing', async () => {
  await expect(
    databaseTls(
      parseEnvironment({ DATABASE_SSL: 'true', DATABASE_SSL_CA_PATH: 'missing-test-ca.crt' }),
    ),
  ).rejects.toThrow();
});
it('rejects a certificate path when TLS is disabled', () => {
  expect(() => parseEnvironment({ DATABASE_SSL_CA_PATH: 'ca.crt' })).toThrow(/TLS/);
});
