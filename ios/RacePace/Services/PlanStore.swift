import Foundation
import SwiftData

/// Persists a freshly-built plan. Insert-only, deliberately no delete-existing-plan step —
/// PlanView reads the current plan via `@Query(sort: \.createdAt, order: .reverse).first`, so the
/// newest plan always wins without risking wiping the only copy via a buggy delete.
enum PlanStore {
    @MainActor
    static func save(_ dto: TrainingPlanDTO, in context: ModelContext) {
        let workouts = dto.workouts.map { workout in
            StoredWorkout(
                id: workout.id.uuidString,
                date: workout.date,
                typeRawValue: workout.type.rawValue,
                targetDistanceMeters: workout.targetDistanceMeters,
                targetDurationSeconds: workout.targetDurationSeconds,
                targetPaceSecPerKm: workout.targetPaceSecPerKm,
                workoutDescription: workout.description,
                coachNotes: workout.coachNotes
            )
        }
        let plan = StoredTrainingPlan(
            raceName: dto.goal.raceName,
            raceDate: dto.goal.raceDate,
            distanceMeters: dto.goal.distanceMeters,
            priority: dto.goal.priority,
            planStartDate: dto.planStartDate,
            planEndDate: dto.planEndDate,
            rationale: dto.rationale,
            createdAt: .now,
            workouts: workouts
        )
        context.insert(plan)
        try? context.save()
    }

    /// Mutates an already-persisted plan in place. Unlike `save`, errors are propagated (not
    /// swallowed) — this modifies existing user data rather than only adding to it, so a silently
    /// dropped save would leave the current session looking correct while reverting on next
    /// launch.
    @MainActor
    static func apply(_ adjustment: PlanAdjustmentDTO, to plan: StoredTrainingPlan, in context: ModelContext) throws {
        for change in adjustment.changes {
            switch change.changeType {
            case "remove":
                guard let id = change.workoutId, let existing = plan.workouts.first(where: { $0.id == id }) else { continue }
                // Deleting the child is sufficient — SwiftData updates the relationship graph
                // itself. Don't also mutate plan.workouts directly; redundant and unnecessary.
                context.delete(existing)

            case "modify":
                guard let id = change.workoutId,
                      let existing = plan.workouts.first(where: { $0.id == id }),
                      let after = change.after
                else { continue }
                existing.date = after.date
                existing.typeRawValue = after.type.rawValue
                existing.targetDistanceMeters = after.targetDistanceMeters
                existing.targetDurationSeconds = after.targetDurationSeconds
                existing.targetPaceSecPerKm = after.targetPaceSecPerKm
                existing.workoutDescription = after.description
                existing.coachNotes = after.coachNotes

            case "insert":
                guard let after = change.after else { continue }
                let newWorkout = StoredWorkout(
                    id: UUID().uuidString,
                    date: after.date,
                    typeRawValue: after.type.rawValue,
                    targetDistanceMeters: after.targetDistanceMeters,
                    targetDurationSeconds: after.targetDurationSeconds,
                    targetPaceSecPerKm: after.targetPaceSecPerKm,
                    workoutDescription: after.description,
                    coachNotes: after.coachNotes
                )
                // Set only ONE side of the relationship and let SwiftData fix up the inverse
                // (newWorkout.plan) itself — setting both this array append AND newWorkout.plan
                // explicitly is a known SwiftData footgun that can double-link the entry.
                context.insert(newWorkout)
                plan.workouts.append(newWorkout)

            default:
                continue
            }
        }
        try context.save()
    }
}
