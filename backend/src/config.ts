function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  strava: {
    clientId: requireEnv("STRAVA_CLIENT_ID"),
    clientSecret: requireEnv("STRAVA_CLIENT_SECRET"),
  },
  anthropic: {
    // No API key here on purpose — the chat coach authenticates via the Claude Agent SDK's
    // subscription login (`claude login`, run once on this host), which bills against a
    // Claude Pro/Max plan's included usage instead of metered API tokens. See claudeClient.ts.
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
  },
  appSharedSecret: requireEnv("APP_SHARED_SECRET"),
};
