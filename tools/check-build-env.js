#!/usr/bin/env node
/**
 * Fails an EAS build early when the Supabase config is missing (review finding A2).
 *
 * `src/config/supabase.ts` throws at import time without these values, and EAS
 * Build never uploads the gitignored `.env`. Without this check a cloud build
 * succeeds and ships an app that crashes on launch. Runs automatically on the
 * EAS worker via the `eas-build-pre-install` npm hook; run it locally with
 * `node tools/check-build-env.js` after exporting the variables.
 */
const problems = [];
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url) problems.push('EXPO_PUBLIC_SUPABASE_URL is not set');
else if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) problems.push('EXPO_PUBLIC_SUPABASE_URL is not an https://<ref>.supabase.co URL');

if (!key) problems.push('EXPO_PUBLIC_SUPABASE_ANON_KEY is not set');
else if (key.includes('...') || key.startsWith('<')) problems.push('EXPO_PUBLIC_SUPABASE_ANON_KEY is still the .env.example placeholder');
else if (key.startsWith('sb_secret_') || /service_role/.test(Buffer.from(key.split('.')[1] || '', 'base64').toString())) {
  problems.push('EXPO_PUBLIC_SUPABASE_ANON_KEY is a SECRET key; it would ship inside the app. Use the publishable key.');
}

if (problems.length) {
  console.error('\nBuild environment check failed:\n  - ' + problems.join('\n  - '));
  console.error('\nRegister the values for this build profile, e.g.:\n  eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value "https://<ref>.supabase.co"\n');
  process.exit(1);
}
console.log('Build environment check passed.');
