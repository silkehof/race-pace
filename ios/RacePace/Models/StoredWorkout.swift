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

    /// Completion is a plain flag the athlete fully controls (toggle in PlanView/WorkoutDetailView)
    /// — not derived solely from a Strava match, so an athlete can still mark complete a workout
    /// Strava never saw (e.g. an unlogged strength session), or override a wrong auto-match.
    var isCompleted: Bool = false
    /// Populated by ActivityMatcher when a same-day, compatible-type Strava activity is found.
    /// Purely informational (planned-vs-actual display) — doesn't drive `isCompleted` once set, so
    /// re-running the matcher can't silently un-override a manual toggle. nil until matched.
    var matchedStravaActivityId: String?
    var matchedActivityDistanceMeters: Double?
    var matchedActivityDurationSeconds: Double?
    var matchedActivityName: String?

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
