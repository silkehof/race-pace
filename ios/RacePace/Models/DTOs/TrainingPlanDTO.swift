import Foundation

/// Mirrors shared/schema/workout.schema.json's `type` enum.
enum WorkoutType: String, Codable {
    case easyRun = "easy_run"
    case longRun = "long_run"
    case tempo
    case interval
    case racePace = "race_pace"
    case recovery
    case crossTrain = "cross_train"
    case strength
    case rest
    case race
}

/// Mirrors shared/schema/workout.schema.json — a fourth hand-synced copy of that contract,
/// alongside the JSON Schema, the backend's ajv validation, and its Zod tool schema.
struct WorkoutDTO: Codable, Identifiable {
    let id = UUID()
    let date: String
    let type: WorkoutType
    let targetDistanceMeters: Double?
    let targetDurationSeconds: Double?
    let targetPaceSecPerKm: Double?
    let description: String
    let coachNotes: String?

    private enum CodingKeys: String, CodingKey {
        case date, type, targetDistanceMeters, targetDurationSeconds, targetPaceSecPerKm, description, coachNotes
    }
}

struct RaceGoalDTO: Codable {
    let raceName: String
    let raceDate: String
    let distanceMeters: Double
    let priority: String
}

/// Mirrors shared/schema/training-plan.schema.json — the create_training_plan tool payload.
struct TrainingPlanDTO: Codable {
    let goal: RaceGoalDTO
    let planStartDate: String
    let planEndDate: String
    let workouts: [WorkoutDTO]
    let rationale: String
}
