import Foundation

/// Wire shape for one prior turn — matches the backend's `ChatTurn` (backend/src/services/claudeClient.ts).
struct ChatTurnDTO: Codable {
    let role: String
    let content: String
}

/// One recent hard effort, offered to the backend's pace engine as a possible performance
/// benchmark (backend/src/services/paceEngine.ts). The split of responsibilities is deliberate:
/// the app reduces a few months of Strava history down to a handful of candidates, and the
/// backend decides which is the best *performance* — that comparison is a VDOT calculation, not a
/// pace comparison, so a hard 5K and a strong 16km can be ranked against each other.
struct BenchmarkEffortDTO: Encodable {
    let date: String
    /// The Strava activity title, which is the only signal either side has for whether this was
    /// an actual race rather than a hard training run.
    let name: String
    let distanceMeters: Double
    let durationSeconds: Int
    /// Lets the backend spot a net-downhill effort, which would otherwise win its distance band on
    /// pace and prescribe training paces the athlete can't hold on the flat.
    let elevationGainMeters: Double?
    let elevationRangeMeters: Double?
    /// Reported rather than filtered out, so the backend can tell the coach *why* a treadmill
    /// runner has no usable benchmark instead of claiming nothing was found.
    let isTreadmill: Bool
}

/// Recent-training summary sent as `athleteContext` for create_plan mode, per planGenerationRules
/// (backend/src/prompts/planGenerationRules.ts) and typed on the backend in
/// backend/src/services/athleteContext.ts.
struct AthleteContextSummary: Encodable {
    let recentWeeklyDistanceKm: Double
    let recentRunCount: Int
    /// Distinct days with a run over the last 28 days, divided by four — a plan should broadly
    /// match the frequency the athlete already sustains rather than jump past it.
    let runDaysPerWeek: Double
    /// Longest single run of the last 30 days. This is the denominator of the backend's
    /// single-session spike guard, the load pattern that actually predicts overuse injury, so
    /// without it the plan's opening weeks are unguarded — precisely where a spike is likeliest.
    let longestRunLast30DaysKm: Double
    let benchmarkCandidates: [BenchmarkEffortDTO]
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
    /// Goal race distance, when the guided intake has already established it. Lets the backend
    /// convert the athlete's benchmark into an equivalent time for *this* race, which is what
    /// makes a goal-time reality check possible.
    let goalDistanceMeters: Double?
    /// The athlete's target finish time, if they gave one. Checked for realism against what their
    /// recent running implies — never used to derive training paces, which come from what they
    /// have actually run rather than what they hope to run.
    let goalTimeSeconds: Int?
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
