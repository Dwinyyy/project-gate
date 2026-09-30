import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getMyCharacter } from '@hunter-world/client';
import { useAccountAuth } from '../auth/AuthProvider';

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
    queryFn: async ({ signal }) => ({ owner, value: await getMyCharacter(token!, signal) }),
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
    try {
      sessionStorage.removeItem(
        `hunter-character-attempt:${owner.split(':').slice(0, 2).join(':')}`,
      );
    } catch {
      /* Storage is optional; confirmed server state remains authoritative. */
    }
  }, [owner, data?.character]);
  return {
    owner,
    session,
    token,
    query,
    data,
  };
}
