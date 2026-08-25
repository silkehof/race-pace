import { afterEach, describe, expect, it, vi } from "vitest";
import {
  StravaAuthError,
  exchangeAuthorizationCode,
  refreshAccessToken,
} from "../src/services/stravaAuth.js";

const DEFAULT_REDIRECT_URI = "https://silkehof.github.io/racepace-strava-callback/";

function mockFetchOnce(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("exchangeAuthorizationCode", () => {
  it("posts the authorization_code grant with the default redirect_uri", async () => {
    const tokenResponse = { access_token: "at", refresh_token: "rt", expires_at: 123 };
    const fetchMock = mockFetchOnce(new Response(JSON.stringify(tokenResponse), { status: 200 }));

    const result = await exchangeAuthorizationCode("auth-code");

    expect(result).toEqual(tokenResponse);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://www.strava.com/oauth/token");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      client_id: "test-client-id",
      client_secret: "test-client-secret",
      code: "auth-code",
      grant_type: "authorization_code",
      redirect_uri: DEFAULT_REDIRECT_URI,
    });
  });

  it("uses an explicit redirect_uri override when passed", async () => {
    const fetchMock = mockFetchOnce(
      new Response(JSON.stringify({ access_token: "at", refresh_token: "rt", expires_at: 1 }), {
        status: 200,
      }),
    );

    await exchangeAuthorizationCode("auth-code", "https://example.com/callback");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.redirect_uri).toBe("https://example.com/callback");
  });

  it("throws StravaAuthError with the status and body on a non-OK response", async () => {
    mockFetchOnce(new Response("bad code", { status: 400 }));

    await expect(exchangeAuthorizationCode("auth-code")).rejects.toThrow(StravaAuthError);
  });
});

describe("refreshAccessToken", () => {
  it("posts the refresh_token grant without a redirect_uri", async () => {
    const tokenResponse = { access_token: "at2", refresh_token: "rt2", expires_at: 456 };
    const fetchMock = mockFetchOnce(new Response(JSON.stringify(tokenResponse), { status: 200 }));

    const result = await refreshAccessToken("old-refresh-token");

    expect(result).toEqual(tokenResponse);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({
      client_id: "test-client-id",
      client_secret: "test-client-secret",
      refresh_token: "old-refresh-token",
      grant_type: "refresh_token",
    });
    expect(body.redirect_uri).toBeUndefined();
  });

  it("throws StravaAuthError on a non-OK response", async () => {
    mockFetchOnce(new Response("invalid_grant", { status: 401 }));

    await expect(refreshAccessToken("bad-token")).rejects.toThrow(StravaAuthError);
  });
});
