# Strava API app setup (one-time, manual)

The backend needs a Strava API application to get a client ID/secret. This can't be automated — it requires logging into Strava's site.

1. Go to https://www.strava.com/settings/api and create an API application (or use an existing one).
2. Set **Authorization Callback Domain** to `silkehof.github.io`.

   Strava's `/oauth/authorize` requires `redirect_uri` to be a real `http(s)` URL matching this
   domain — it rejects a custom URL scheme like `racepace://strava-callback` outright, even when
   the scheme's host string matches the registered domain (confirmed by testing; get this wrong
   and Strava shows `{resource: "Application", field: "redirect_uri", code: "invalid"}` directly
   on strava.com, before your app or backend are ever involved).

   Since a native app can't itself be reached at an `http(s)` URL, the redirect actually goes
   through a tiny static page: `docs/strava-callback-page/index.html`, hosted at
   https://github.com/silkehof/racepace-strava-callback and served via GitHub Pages at
   https://silkehof.github.io/racepace-strava-callback/. That page does nothing but immediately
   forward to `racepace://strava-callback?<the same query params>`, which is the scheme
   `ASWebAuthenticationSession` is actually watching for
   (`StravaAuthService.redirectScheme`) — the app never talks to that page directly, it's purely
   the required `https` hop Strava insists on. If you fork this project under a different GitHub
   account, redeploy that page under your own username and update `StravaAuthService.redirectURI`
   (iOS) and `DEFAULT_REDIRECT_URI` (`backend/src/services/stravaAuth.ts`) to match, along with
   the Authorization Callback Domain here.
3. Copy the **Client ID** and **Client Secret** into `backend/.env` as `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET`.
4. Required scopes for this app: `read,activity:read_all` (profile + activity history, no write access needed).

## Manually obtaining a test authorization code (for Phase 2 curl testing)

Before any iOS UI exists, you can exercise `/api/strava/oauth/exchange` by hand:

1. Visit (with your own client ID):
   `https://www.strava.com/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=https://silkehof.github.io/racepace-strava-callback/&response_type=code&scope=read,activity:read_all`
2. Approve. The redirect page forwards to `racepace://strava-callback?...`, which a desktop
   browser has nothing registered to handle — it'll show a "cannot open page" / similar error on
   that final hop, which is expected. The `code` query param is still visible in that attempted
   URL (address bar or page content depending on browser); copy it from there.
3. `curl -X POST http://localhost:3000/api/strava/oauth/exchange -H 'Content-Type: application/json' -d '{"code":"<paste code>"}'`

   No `redirect_uri` override needed here — it matches the backend's default (the same GitHub
   Pages URL), which is also what step 1 used. The override param exists for testing against a
   *different* registered redirect_uri than the app's own.

Authorization codes are single-use and short-lived — get a fresh one for each test.
