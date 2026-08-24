import Foundation

enum BackendAPIError: Error {
    case http(status: Int, body: String)
    case noResponse
}

struct BackendAPIClient {
    /// Overridable in Settings for pointing at a deployed backend; defaults to local dev.
    static var baseURL: URL {
        if let override = UserDefaults.standard.string(forKey: "backendBaseURLOverride"),
            let url = URL(string: override)
        {
            return url
        }
        return URL(string: "http://localhost:3000")!
    }

    func exchangeStravaCode(_ code: String) async throws -> StravaTokenResponse {
        struct Body: Encodable { let code: String }
        let data = try await post(path: "/api/strava/oauth/exchange", body: Body(code: code))
        return try JSONDecoder().decode(StravaTokenResponse.self, from: data)
    }

    func sendCoachMessage(_ request: CoachMessageRequest) async throws -> CoachMessageResponse {
        // Building a full multi-week plan is a much heavier agentic turn than a plain chat
        // reply — it can legitimately take longer than URLSession's 60s default, especially if
        // the coach's tool call fails ajv validation once and has to retry within the same turn.
        let data = try await post(path: "/api/coach/message", body: request, timeout: 180)
        return try JSONDecoder().decode(CoachMessageResponse.self, from: data)
    }

    func refreshStravaToken(_ refreshToken: String) async throws -> StravaTokenResponse {
        struct Body: Encodable {
            let refreshToken: String
            enum CodingKeys: String, CodingKey { case refreshToken = "refresh_token" }
        }
        let data = try await post(
            path: "/api/strava/oauth/refresh", body: Body(refreshToken: refreshToken))
        return try JSONDecoder().decode(StravaTokenResponse.self, from: data)
    }

    private func post(path: String, body: some Encodable, timeout: TimeInterval = 60) async throws -> Data {
        var request = URLRequest(url: Self.baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(AppSecrets.appSharedSecret, forHTTPHeaderField: "x-app-secret")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendAPIError.noResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            throw BackendAPIError.http(status: http.statusCode, body: String(data: data, encoding: .utf8) ?? "")
        }
        return data
    }
}
