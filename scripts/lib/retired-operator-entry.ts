import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const RETIRED_OPERATOR_BRIDGE = '/_legacy/operator/';
export const MAIN_SITE_SIGN_IN = 'https://project-gate-player.vercel.app/account/sign-in';

/** A neutral static entry. Navigation uses a fixed URL and never reads the old URL. */
export async function writeRetiredOperatorEntry(
  directory: string,
  destination: string,
  scriptPath: string,
): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, 'index.html'),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <meta name="referrer" content="no-referrer" />
    <meta name="theme-color" content="#080d13" />
    <title>Continue to sign in</title>
    <style>
      :root { color-scheme: dark; }
      body { min-height: 100dvh; margin: 0; display: grid; place-items: center;
        background: #080d13; color: #e2eeeb; font: 16px/1.5 system-ui, sans-serif; }
      main { width: min(408px, calc(100% - 48px)); padding: 32px;
        border: 1px solid #294148; border-radius: 20px; background: #101b22; }
      h1 { margin: 0 0 12px; font-size: 1.5rem; }
      p { margin: 0; color: #b3c7c5; }
      a { color: #8bdfcb; }
    </style>
    <script src="${scriptPath}" defer></script>
  </head>
  <body>
    <main>
      <h1>This entry has moved.</h1>
      <p><a href="${destination}">Continue to main-site sign in</a></p>
    </main>
  </body>
</html>
`,
    'utf8',
  );
  await writeFile(
    join(directory, 'redirect.js'),
    `window.location.replace(${JSON.stringify(destination)});\n`,
    'utf8',
  );
}
