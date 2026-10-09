import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { ProfileInvitationMemory, ProfileInvitationSnapshot } from './profileInvitation';

export type ProfileInvitationContext = ProfileInvitationSnapshot & {
  captureLink(value: string): boolean;
  bindReader(attemptKey: string): boolean;
  clear(): void;
};
const Context = createContext<ProfileInvitationMemory | null>(null);

export function ProfileInvitationProvider({
  memory,
  children,
}: {
  memory: ProfileInvitationMemory;
  children: ReactNode;
}): ReactNode {
  return <Context.Provider value={memory}>{children}</Context.Provider>;
}

export function useProfileInvitation(): ProfileInvitationContext {
  const memory = useProfileInvitationMemory();
  const snapshot = useSyncExternalStore(memory.subscribe, memory.getSnapshot, memory.getSnapshot);
  return useMemo(
    () => ({
      ...snapshot,
      captureLink: (value: string) => memory.captureLink(value, window.location.origin),
      bindReader: memory.bindReader,
      clear: memory.clear,
    }),
    [memory, snapshot],
  );
}

// Internal auth continuation reads current memory after asynchronous sign-in,
// rather than retaining a rendered scan in that request's closure.
export function useProfileInvitationMemory(): ProfileInvitationMemory {
  const memory = useContext(Context);
  if (!memory) throw new Error('The profile invitation provider is missing.');
  return memory;
}
