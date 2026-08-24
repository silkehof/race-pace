import { config } from "../config.js";

const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";

// Default matches the redirect_uri the iOS app sends to /oauth/authorize
// (StravaAuthService.redirectURI) — a static HTTPS redirect page, NOT the racepace:// scheme
// directly. Strava's /oauth/authorize rejects a custom-scheme redirect_uri outright (confirmed
// by testing), even when its host matches the registered Authorization Callback Domain, so the
// app sends this real page as redirect_uri and that page forwards to racepace://strava-callback
// as a second hop — see docs/strava-callback-page/index.html. RFC 6749 §4.1.3 requires the token
// exchange to resend the exact redirect_uri used in the authorization request, or Strava rejects
// it with {field: "redirect_uri", code: "invalid"} — callers using a different authorize
// redirect_uri (e.g. the manual curl flow in docs/strava-app-setup.md) must pass it explicitly.
const DEFAULT_REDIRECT_URI = "https://silkehof.github.io/racepace-strava-callback/";

export interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: unknown;
}

export class StravaAuthError extends Error {
  constructor(
    public readonly status: number,
    body: string,
  ) {
    super(`Strava token request failed (${status}): ${body}`);
  }
}

export function exchangeAuthorizationCode(
  code: string,
  redirectUri: string = DEFAULT_REDIRECT_URI,
): Promise<StravaTokenResponse> {
  return callStravaTokenEndpoint({
    client_id: config.strava.clientId,
    client_secret: config.strava.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
}

export function refreshAccessToken(refreshToken: string): Promise<StravaTokenResponse> {
  return callStravaTokenEndpoint({
    client_id: config.strava.clientId,
    client_secret: config.strava.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
}

async function callStravaTokenEndpoint(
  params: Record<string, string>,
): Promise<StravaTokenResponse> {
  const response = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new StravaAuthError(response.status, body);
  }

  return (await response.json()) as StravaTokenResponse;
}
