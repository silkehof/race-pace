import Foundation

/// Wire shape for one prior turn — matches the backend's `ChatTurn` (backend/src/services/claudeClient.ts).
struct ChatTurnDTO: Codable {
    let role: String
    let content: String
}

/// Recent-training summary sent as `athleteContext` for create_plan mode, per planGenerationRules
/// (backend/src/prompts/planGenerationRules.ts). Free-form on the wire — the backend just
/// JSON-stringifies whatever it's given into the prompt — so this shape is ours to define.
struct AthleteContextSummary: Encodable {
    let recentWeeklyDistanceKm: Double
    let recentRunCount: Int
    let longestRecentRunKm: Double
}

/// Includes `id` (needed for the backend's knownWorkoutIds cross-check) alongside the full
/// workout detail — the backend also echoes this whole object into the prompt for adjust_plan
/// mode, so the coach can actually see what each workout is, not just that its id exists.
struct CurrentPlanWorkoutRefDTO: Encodable {
    let id: String
    let date: String
    let type: String
    let targetDistanceMeters: Double?
    let targetDurationSeconds: Double?
    let targetPaceSecPerKm: Double?
    let description: String
    let coachNotes: String?
}

struct CurrentPlanDTO: Encodable {
    let raceName: String
    let raceDate: String
    let distanceMeters: Double
    let priority: String
    let planStartDate: String
    let planEndDate: String
    let workouts: [CurrentPlanWorkoutRefDTO]
}

struct CoachMessageRequest: Encodable {
    let mode: String
    let history: [ChatTurnDTO]
    let message: String
    let athleteContext: AthleteContextSummary?
    let currentPlan: CurrentPlanDTO?
}

/// The `input` field's shape depends on `name`.
struct ToolCallDTO: Decodable {
    let name: String
    let trainingPlan: TrainingPlanDTO?
    let planAdjustment: PlanAdjustmentDTO?

    private enum CodingKeys: String, CodingKey { case name, input }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let name = try container.decode(String.self, forKey: .name)
        self.name = name
        self.trainingPlan = name == "create_training_plan" ? try container.decode(TrainingPlanDTO.self, forKey: .input) : nil
        self.planAdjustment = name == "propose_plan_adjustment" ? try container.decode(PlanAdjustmentDTO.self, forKey: .input) : nil
    }
}

struct CoachMessageResponse: Decodable {
    let text: String
    let toolCall: ToolCallDTO?
}
