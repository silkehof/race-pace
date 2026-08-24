import Foundation

struct StravaActivityDTO: Decodable, Identifiable {
    let id: Int
    let name: String
    let type: String
    let startDate: Date
    let distance: Double
    let movingTime: Int

    enum CodingKeys: String, CodingKey {
        case id, name, type
        case startDate = "start_date"
        case distance
        case movingTime = "moving_time"
    }
}
