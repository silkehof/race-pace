import Foundation
import SwiftData

@Model
final class StoredWorkout {
    @Attribute(.unique) var id: String
    var date: String
    /// Raw string, not WorkoutType directly — matches CachedStravaActivity's convention and
    /// avoids SwiftData's unclear #Predicate support for enum-backed properties.
    var typeRawValue: String
    var targetDistanceMeters: Double?
    var targetDurationSeconds: Double?
    var targetPaceSecPerKm: Double?
    var workoutDescription: String
    var coachNotes: String?
    var plan: StoredTrainingPlan?

    var type: WorkoutType {
        WorkoutType(rawValue: typeRawValue) ?? .easyRun
    }

    /// Falls back to duration/pace when distance wasn't given directly (e.g. "20 min tempo"),
    /// so weekly mileage totals don't silently undercount duration-only workouts.
    var estimatedDistanceMeters: Double {
        if let targetDistanceMeters {
            return targetDistanceMeters
        }
        if let targetDurationSeconds, let targetPaceSecPerKm, targetPaceSecPerKm > 0 {
            return (targetDurationSeconds / targetPaceSecPerKm) * 1000
        }
        return 0
    }

    init(
        id: String,
        date: String,
        typeRawValue: String,
        targetDistanceMeters: Double?,
        targetDurationSeconds: Double?,
        targetPaceSecPerKm: Double?,
        workoutDescription: String,
        coachNotes: String?
    ) {
        self.id = id
        self.date = date
        self.typeRawValue = typeRawValue
        self.targetDistanceMeters = targetDistanceMeters
        self.targetDurationSeconds = targetDurationSeconds
        self.targetPaceSecPerKm = targetPaceSecPerKm
        self.workoutDescription = workoutDescription
        self.coachNotes = coachNotes
    }
}
