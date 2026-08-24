import Foundation

struct PlanAdjustmentTriggerDTO: Decodable {
    let type: String
    let workoutId: String
    let details: String
}

/// Identity for modify/remove comes ONLY from `workoutId` here — never from before.id/after.id
/// (WorkoutDTO.id is a random UUID assigned at decode time, carrying no server identity — see
/// TrainingPlanDTO.swift). Neither the JSON Schema nor the backend's ajv validation actually
/// enforces "insert -> workoutId null" / "modify,remove -> workoutId+after non-null" — every
/// field here is independently possibly-nil; handle unexpected combinations by skipping, not
/// crashing.
struct PlanAdjustmentChangeDTO: Decodable {
    let workoutId: String?
    let changeType: String
    let before: WorkoutDTO?
    let after: WorkoutDTO?
}

struct PlanAdjustmentDTO: Decodable {
    let triggerEvent: PlanAdjustmentTriggerDTO
    let rationale: String
    let changes: [PlanAdjustmentChangeDTO]
}
