import Foundation
import SwiftData

@Model
final class CachedStravaActivity {
    @Attribute(.unique) var stravaActivityId: String
    var name: String
    var type: String
    var startDate: Date
    var distanceMeters: Double
    var movingTimeSeconds: Double
    var syncedAt: Date

    init(
        stravaActivityId: String,
        name: String,
        type: String,
        startDate: Date,
        distanceMeters: Double,
        movingTimeSeconds: Double,
        syncedAt: Date = .now
    ) {
        self.stravaActivityId = stravaActivityId
        self.name = name
        self.type = type
        self.startDate = startDate
        self.distanceMeters = distanceMeters
        self.movingTimeSeconds = movingTimeSeconds
        self.syncedAt = syncedAt
    }
}
