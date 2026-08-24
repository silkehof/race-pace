import AuthenticationServices
import Foundation
import UIKit

enum StravaAuthServiceError: Error {
    case invalidAuthorizationURL
    case missingAuthorizationCode
    case notConnected
}

/// Owns the Strava OAuth dance and token lifecycle. Tokens live only in Keychain
/// (via KeychainStore) — never in SwiftData/UserDefaults.
@MainActor
final class StravaAuthService: NSObject, ASWebAuthenticationPresentationContextProviding {
    /// Scheme ASWebAuthenticationSession watches for to intercept the final hop back to the app.
    static let redirectScheme = "racepace"
    /// The redirect_uri sent to Strava's /oauth/authorize. Strava requires an http(s) URI here —
    /// it rejects a custom scheme directly, even when the scheme's host matches the app's
    /// registered Authorization Callback Domain (confirmed by testing, contrary to the
    /// docs/strava-app-setup.md's original approach). So this points at a tiny static page
    /// (docs/strava-callback-page/index.html, hosted at
    /// https://github.com/silkehof/racepace-strava-callback) that immediately forwards to
    /// racepace://strava-callback — which is what redirectScheme above actually intercepts.
    static let redirectURI = "https://silkehof.github.io/racepace-strava-callback/"

    private let backend = BackendAPIClient()
    private var activeSession: ASWebAuthenticationSession?

    var isConnected: Bool {
        KeychainStore.get(.accessToken) != nil
    }

    func connect() async throws {
        let code = try await requestAuthorizationCode()
        let tokens = try await backend.exchangeStravaCode(code)
        store(tokens)
    }

    func disconnect() {
        KeychainStore.removeAll()
    }

    /// Returns a valid access token, refreshing via the backend first if it's expired or about to expire.
    func validAccessToken() async throws -> String {
        guard let accessToken = KeychainStore.get(.accessToken),
            let expiresAtRaw = KeychainStore.get(.expiresAt),
            let expiresAtEpoch = Double(expiresAtRaw)
        else {
            throw StravaAuthServiceError.notConnected
        }

        let expiresAt = Date(timeIntervalSince1970: expiresAtEpoch)
        if expiresAt.timeIntervalSinceNow > 60 {
            return accessToken
        }

        guard let refreshToken = KeychainStore.get(.refreshToken) else {
            throw StravaAuthServiceError.notConnected
        }
        let tokens = try await backend.refreshStravaToken(refreshToken)
        store(tokens)
        return tokens.accessToken
    }

    private func store(_ tokens: StravaTokenResponse) {
        KeychainStore.set(tokens.accessToken, for: .accessToken)
        KeychainStore.set(tokens.refreshToken, for: .refreshToken)
        KeychainStore.set(String(tokens.expiresAtEpoch), for: .expiresAt)
    }

    private func requestAuthorizationCode() async throws -> String {
        guard let authURL = Self.buildAuthorizationURL() else {
            throw StravaAuthServiceError.invalidAuthorizationURL
        }

        return try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: authURL,
                callbackURLScheme: Self.redirectScheme
            ) { callbackURL, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let callbackURL,
                    let code = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?
                        .queryItems?.first(where: { $0.name == "code" })?.value
                else {
                    continuation.resume(throwing: StravaAuthServiceError.missingAuthorizationCode)
                    return
                }
                continuation.resume(returning: code)
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.activeSession = session
            session.start()
        }
    }

    private static func buildAuthorizationURL() -> URL? {
        var components = URLComponents(string: "https://www.strava.com/oauth/authorize")
        components?.queryItems = [
            URLQueryItem(name: "client_id", value: AppSecrets.stravaClientId),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "approval_prompt", value: "auto"),
            URLQueryItem(name: "scope", value: "read,activity:read_all"),
        ]
        return components?.url
    }

    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap { $0.windows }
                .first { $0.isKeyWindow } ?? ASPresentationAnchor()
        }
    }
}
