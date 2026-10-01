import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { getMyCharacter } from '@hunter-world/client';
import { useAccountAuth } from '../auth/AuthProvider';
import {
  characterAttemptKey,
  readCharacterAttempt,
  storeCharacterAttempt,
} from './characterAttempts';

export function useCharacterSession() {
  const { auth, validation, session, validationGeneration } = useAccountAuth();
  const owner =
    auth.phase === 'authenticated' &&
    validation === 'valid' &&
    session?.applicationRole === 'player' &&
    session.authUserId === auth.user?.id &&
    auth.accessToken
      ? `${session.authUserId}:${session.sessionId}:${validationGeneration}`
      : null;
  const token = auth.accessToken;
  const query = useQuery({
    queryKey: ['character', 'private', owner],
    queryFn: async ({ signal }) => {
      // Only a read started after this unresolved attempt can confirm it.
      // Capture both identities before the request; late owner/generation results
      // still cannot render or unlock a current session.
      const attempt = owner ? readCharacterAttempt(characterAttemptKey(owner)) : null;
      const confirmation = attempt
        ? { operationId: attempt.operationId, confirmationVersion: attempt.confirmationVersion }
        : null;
      return { owner, value: await getMyCharacter(token!, signal), confirmation };
    },
    enabled: owner !== null,
    retry: false,
    refetchOnReconnect: true,
    staleTime: 0,
  });
  const data =
    owner && query.data?.owner === owner && !query.isPaused && !query.isError
      ? query.data.value
      : undefined;
  useEffect(() => {
    if (!owner || !data?.character) return;
    storeCharacterAttempt(characterAttemptKey(owner), null);
  }, [owner, data?.character]);
  const refetch = query.refetch;
  const refresh = useCallback(async () => {
    const result = await refetch();
    return {
      data: result.isSuccess && result.data?.owner === owner ? result.data.value : undefined,
    };
  }, [owner, refetch]);
  return {
    owner,
    session,
    token,
    query,
    data,
    refresh,
    confirmation: data && query.data?.owner === owner ? query.data.confirmation : null,
  };
}
