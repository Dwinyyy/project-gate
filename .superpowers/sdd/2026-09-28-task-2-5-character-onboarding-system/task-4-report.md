# Task 4 — Typed browser character transport

## Outcome

Implemented the private character transport in `packages/client/src/character.ts`, exported it from `packages/client/src/index.ts`, and added `tests/unit/character-client.test.ts`. `getMyCharacter` and `createMyCharacter` use bearer authorization, `cache: 'no-store'`, and the optional caller signal. Creation uses the operation ID as `Idempotency-Key` and serializes only the defined alias and appearance fields. Responses are checked against the v3 contract shape at runtime. Typed errors carry the status, safe code/request ID when the exact error envelope is valid, and `Retry-After` as seconds when available; messages do not include server-provided prose or credentials.

## Red/green evidence

- Before implementation: `pnpm exec vitest run tests/unit/character-client.test.ts` failed to import the absent `packages/client/src/character.js`; Vitest reported 0 tests collected. This was the expected absent-export red state.
- After implementation: the focused suite passed: **1 test file, 9 tests**. Coverage includes v3 success, malformed/extra-field rejection, safe 401/403/409/503 errors, retry delay, abort propagation, and exact POST body/headers including removal of runtime extra fields.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm exec prettier --check packages/client/src/character.ts packages/client/src/index.ts tests/unit/character-client.test.ts` passed.
- `pnpm check:boundaries` passed: “Public import boundaries verified.”

## Review and limitations

The transport deliberately returns safe generic messages for service failures and preserves valid server codes/request IDs only as structured error fields. It does not log, cache-key, or URL-encode the access token. Abort errors are rethrown unchanged. Retry-After numeric seconds are tested; HTTP-date parsing is implemented but not covered by the focused suite. Full integration/browser behavior and server interaction are outside Task 4. Independent Sol review is pending from the parent against the committed SHA.
