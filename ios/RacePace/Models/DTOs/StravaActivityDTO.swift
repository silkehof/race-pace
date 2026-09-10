import Foundation

struct StravaActivityDTO: Decodable, Identifiable {
    let id: Int
    let name: String
    let type: String
    let startDate: Date
    let distance: Double
    let movingTime: Int
    /// Cumulative ascent. Together with the high/low pair this is enough to tell a run down a
    /// hill from a loop over one — see BenchmarkEffortDTO and the backend's netDescentMeters.
    let totalElevationGain: Double?
    let elevationHigh: Double?
    let elevationLow: Double?
    /// Strava's flag for an activity recorded on a training machine.
    let trainer: Bool?

    /// Treadmill and virtual runs both count as training, but neither can serve as a performance
    /// benchmark — see the backend's paceEngine for why. `VirtualRun` covers Zwift-style apps;
    /// a treadmill run recorded on a watch usually arrives as a plain `Run` with `trainer` set.
    var isTreadmill: Bool { type == "VirtualRun" || trainer == true }

    enum CodingKeys: String, CodingKey {
        case id, name, type
        case startDate = "start_date"
        case distance
        case movingTime = "moving_time"
        case totalElevationGain = "total_elevation_gain"
        case elevationHigh = "elev_high"
        case elevationLow = "elev_low"
        case trainer
    }
}
