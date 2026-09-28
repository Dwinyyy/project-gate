import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMyCharacter,
  getMyCharacter,
  CharacterActionError,
} from '../../packages/client/src/character.js';

const token = 'private-access-token';
const characterId = '11111111-1111-4111-8111-111111111111';
const operationId = '22222222-2222-4222-8222-222222222222';
const createdAt = '2026-09-28T12:00:00.000Z';
const me = {
  schemaVersion: 3,
  mode: 'active',
  character: {
    id: characterId,
    displayAlias: 'Aster',
    appearance: {
      catalogVersion: 1,
      presetId: 'portrait-01',
      skinToneId: 'tone-02',
      hairStyleId: 'curly',
      hairColorId: 'brown',
    },
    lifeState: 'alive',
    awakeningState: 'unawakened',
    presenceState: 'sheltered',
    profileVisibility: 'private',
    revision: '0',
    createdAt,
  },
  creation: { status: 'occupied', notBefore: null },
};
const creation = { characterId, operationId, createdAt };
afterEach(() => vi.unstubAllGlobals());

function jsonResponse(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('character client', () => {
  it('fetches and validates the v3 private character response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(me));
    vi.stubGlobal('fetch', fetcher);
    await expect(getMyCharacter(token)).resolves.toEqual(me);
    expect(fetcher).toHaveBeenCalledWith('/v1/me', {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  });

  it('rejects malformed or extra-field v3 responses', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ ...me, privateField: 'secret' }));
    vi.stubGlobal('fetch', fetcher);
    await expect(getMyCharacter(token)).rejects.toBeInstanceOf(CharacterActionError);
  });

  it.each([
    [401, 'UNAUTHENTICATED'],
    [403, 'ACCOUNT_RESTRICTED'],
    [409, 'CHARACTER_SLOT_OCCUPIED'],
    [503, 'SERVICE_UNAVAILABLE'],
  ])('returns safe typed error details for HTTP %s', async (status, code) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: { code, requestId: characterId } }, status));
    vi.stubGlobal('fetch', fetcher);
    try {
      await getMyCharacter(token);
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(CharacterActionError);
      expect(error).toMatchObject({ status, code, requestId: characterId });
      expect((error as Error).message).not.toContain(token);
    }
  });

  it('parses Retry-After as seconds', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ error: { code: 'RATE_LIMITED', requestId: characterId } }, 429, {
        'Retry-After': '17',
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    await expect(getMyCharacter(token)).rejects.toMatchObject({ retryAfter: 17 });
  });

  it('preserves abort cancellation', async () => {
    const controller = new AbortController();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    vi.stubGlobal('fetch', fetcher);
    await expect(getMyCharacter(token, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it('posts exactly the selected appearance and operation ID with idempotency headers', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(creation, 201));
    vi.stubGlobal('fetch', fetcher);
    const appearance = {
      catalogVersion: 1,
      presetId: 'portrait-01',
      skinToneId: 'tone-02',
      hairStyleId: 'curly',
      hairColorId: 'brown',
      internalExtra: 'must not be sent',
    } as const;
    await expect(
      createMyCharacter(token, { displayAlias: 'Aster', appearance } as never, operationId),
    ).resolves.toEqual(creation);
    expect(fetcher).toHaveBeenCalledWith('/v1/characters', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': operationId,
      },
      body: JSON.stringify({
        displayAlias: 'Aster',
        appearance: {
          catalogVersion: 1,
          presetId: 'portrait-01',
          skinToneId: 'tone-02',
          hairStyleId: 'curly',
          hairColorId: 'brown',
        },
      }),
      cache: 'no-store',
      signal: undefined,
    });
  });
});
