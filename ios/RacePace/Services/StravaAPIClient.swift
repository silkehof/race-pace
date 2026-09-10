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

    /// Upper bound on paging so an unexpected response can't spin indefinitely. At `perPage` this
    /// covers far more activity than any plausible 28-day window.
    private static let perPage = 100
    private static let maxPages = 10

    /// Strava paginates. A 28-day window for someone running doubles plus strength sessions can
    /// exceed a single page, and the overflow was previously dropped without a trace — which makes
    /// a high-volume athlete look like a lower-volume one to the coach, and they're precisely the
    /// athlete whose plan is most sensitive to the baseline being right. Pages until Strava
    /// returns a short page.
    func recentActivities(after: Date? = nil) async throws -> [StravaActivityDTO] {
        let accessToken = try await authService.validAccessToken()
        var all: [StravaActivityDTO] = []

        for page in 1...Self.maxPages {
            let batch = try await activityPage(page: page, after: after, accessToken: accessToken)
            all.append(contentsOf: batch)
            if batch.count < Self.perPage { break }
        }

        return all
    }

    private func activityPage(page: Int, after: Date?, accessToken: String) async throws -> [StravaActivityDTO] {
        var components = URLComponents(
            url: baseURL.appendingPathComponent("athlete/activities"),
            resolvingAgainstBaseURL: false
        )
        var queryItems = [
            URLQueryItem(name: "per_page", value: String(Self.perPage)),
            URLQueryItem(name: "page", value: String(page)),
        ]
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
