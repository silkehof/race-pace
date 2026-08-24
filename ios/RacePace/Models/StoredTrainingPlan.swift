import Foundation
import SwiftData

@Model
final class StoredTrainingPlan {
    var raceName: String
    var raceDate: String
    var distanceMeters: Double
    var priority: String
    var planStartDate: String
    var planEndDate: String
    var rationale: String
    var createdAt: Date
    @Relationship(deleteRule: .cascade) var workouts: [StoredWorkout]

    init(
        raceName: String,
        raceDate: String,
        distanceMeters: Double,
        priority: String,
        planStartDate: String,
        planEndDate: String,
        rationale: String,
        createdAt: Date,
        workouts: [StoredWorkout]
    ) {
        self.raceName = raceName
        self.raceDate = raceDate
        self.distanceMeters = distanceMeters
        self.priority = priority
        self.planStartDate = planStartDate
        self.planEndDate = planEndDate
        self.rationale = rationale
        self.createdAt = createdAt
        self.workouts = workouts
    }
}
