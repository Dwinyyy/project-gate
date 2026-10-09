import { createVercelFrontendConfig } from '../../scripts/vercel-frontend-config.ts';

export const config = createVercelFrontendConfig(process.env.HUNTER_API_ORIGIN, {
  embeddedOperator: true,
});

config.git = {
  deploymentEnabled: {
    'codex/task26-ci-verification': false,
  },
};
