import Foundation

struct StravaTokenResponse: Decodable {
    let accessToken: String
    let refreshToken: String
    let expiresAtEpoch: Int

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresAtEpoch = "expires_at"
    }

    var expiresAt: Date {
        Date(timeIntervalSince1970: TimeInterval(expiresAtEpoch))
    }
}
