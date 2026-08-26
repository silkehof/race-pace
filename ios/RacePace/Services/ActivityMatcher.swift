import Foundation
import SwiftData

/// Matches recent Strava activities to planned workouts by same-day + compatible-type, so the
/// Plan tab can show real completion status without the athlete manually checking off every run.
/// Deliberately coarse (date + broad type family, not distance/pace) — the goal is "did something
/// happen that day that looks like this workout", not verifying the athlete hit the exact prescribed
/// session. Matching one specific Strava activity type taxonomy against ten workout categories with
/// tight rules would be brittle; the athlete can always see planned vs. actual once matched and
/// judge for themselves.
enum ActivityMatcher {
    private static let runTypes: Set<WorkoutType> = [.easyRun, .longRun, .tempo, .interval, .racePace, .recovery, .race]
    private static let runActivityTypes: Set<String> = ["Run", "TrailRun", "VirtualRun"]
    private static let strengthTypes: Set<WorkoutType> = [.strength, .crossTrain]
    private static let strengthActivityTypes: Set<String> = ["WeightTraining", "Workout", "Crossfit", "HIIT", "Yoga"]

    private static func isCompatible(_ workoutType: WorkoutType, _ activityType: String) -> Bool {
        if runTypes.contains(workoutType) { return runActivityTypes.contains(activityType) }
        if strengthTypes.contains(workoutType) { return strengthActivityTypes.contains(activityType) }
        return false
    }

    /// Only touches workouts that haven't been matched before (`matchedStravaActivityId == nil`)
    /// — safe to call every time the Plan tab appears without re-processing everything or
    /// overwriting an athlete's manual unmatch of a bad guess.
    @MainActor
    static func match(_ activities: [StravaActivityDTO], to plan: StoredTrainingPlan, in context: ModelContext) {
        let byDay = Dictionary(grouping: activities) { PlanDateFormatting.isoDayString(from: $0.startDate) }
        var changed = false

        for workout in plan.workouts where workout.matchedStravaActivityId == nil {
            guard let dayActivities = byDay[workout.date],
                  let match = dayActivities.first(where: { isCompatible(workout.type, $0.type) })
            else { continue }

            workout.matchedStravaActivityId = String(match.id)
            workout.matchedActivityDistanceMeters = match.distance
            workout.matchedActivityDurationSeconds = Double(match.movingTime)
            workout.matchedActivityName = match.name
            workout.isCompleted = true
            changed = true
        }

        if changed {
            try? context.save()
        }
    }
}
