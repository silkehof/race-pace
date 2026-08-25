// config.ts reads these via requireEnv() at import time, so anything importing it (directly or
// transitively) needs them set before that import happens — vitest loads setupFiles first.
process.env.STRAVA_CLIENT_ID ??= "test-client-id";
process.env.STRAVA_CLIENT_SECRET ??= "test-client-secret";
process.env.APP_SHARED_SECRET ??= "test-shared-secret";
