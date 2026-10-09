import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@hunter-world/ui/styles.css';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';
import { ProfileInvitationProvider } from './profile/ProfileInvitationProvider';
import {
  captureInitialProfileInvitation,
  createProfileInvitationMemory,
} from './profile/profileInvitation';

const invitationMemory = createProfileInvitationMemory(
  captureInitialProfileInvitation(window.location, window.history),
);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

const root = document.getElementById('root');
if (!root) throw new Error('The application root is missing.');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ProfileInvitationProvider memory={invitationMemory}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </ProfileInvitationProvider>
    </QueryClientProvider>
  </StrictMode>,
);
