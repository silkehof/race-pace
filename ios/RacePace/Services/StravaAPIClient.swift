import Foundation

enum StravaAPIError: Error {
    case requestFailed(status: Int)
}

/// Talks to Strava's REST API directly using the on-device access token — no backend
/// involvement here, per architecture decision (only OAuth exchange/refresh need the secret).
final class StravaAPIClient {
    private let authService: StravaAuthService
    private let baseURL = URL(string: "https://www.strava.com/api/v3")!

    init(authService: StravaAuthService) {
        self.authService = authService
    }

    func recentActivities(after: Date? = nil) async throws -> [StravaActivityDTO] {
        let accessToken = try await authService.validAccessToken()

        var components = URLComponents(
            url: baseURL.appendingPathComponent("athlete/activities"),
            resolvingAgainstBaseURL: false
        )
        var queryItems = [URLQueryItem(name: "per_page", value: "50")]
        if let after {
            queryItems.append(
                URLQueryItem(name: "after", value: String(Int(after.timeIntervalSince1970))))
        }
        components?.queryItems = queryItems

        guard let url = components?.url else {
            throw StravaAPIError.requestFailed(status: -1)
        }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? -1
            throw StravaAPIError.requestFailed(status: status)
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode([StravaActivityDTO].self, from: data)
    }
}
