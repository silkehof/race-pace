import Foundation
import SwiftData

struct ChatMessage: Identifiable {
    enum Role: String { case user, assistant }
    let id = UUID()
    let role: Role
    let content: String
}

@MainActor
final class ChatViewModel: ObservableObject {
    @Published var messages: [ChatMessage] = []
    @Published var draftText = ""
    @Published var isSending = false
    @Published var errorMessage: String?
    @Published private(set) var createdPlan: TrainingPlanDTO?
    @Published private(set) var planWasUpdated = false
    /// Set when the athlete explicitly chooses "start a new plan" while one already exists —
    /// forces create_plan mode for this conversation even though `currentPlan` is non-nil, until
    /// the new plan is actually created (see `send()`'s mode line and the reset after a
    /// successful create_training_plan call below).
    @Published private(set) var isStartingNewPlan = false

    private let backend = BackendAPIClient()
    private let authService: StravaAuthService
    private var athleteContext: AthleteContextSummary?

    init(authService: StravaAuthService) {
        self.authService = authService
    }

    /// Called when the athlete picks "start a new plan" while one already exists. Clears the
    /// transcript and any prior create/adjust results — this is a deliberate fresh start, not a
    /// continuation, so carrying old messages into the new conversation would just confuse the
    /// coach with stale context.
    func beginNewPlan() {
        isStartingNewPlan = true
        messages = []
        createdPlan = nil
        planWasUpdated = false
        errorMessage = nil
    }

    /// Backs out of the guided intake screen without sending anything, returning to the
    /// existing-plan choice prompt.
    func cancelNewPlan() {
        isStartingNewPlan = false
    }

    /// Composes the guided intake form's answers into the first message of a create_plan
    /// conversation. planGenerationRules.ts is told to expect this — the athlete has already
    /// stated race name/date/distance/priority explicitly, so the coach shouldn't re-ask for them.
    func submitGuidedIntake(
        raceName: String,
        raceDate: Date,
        distanceMeters: Double,
        priority: String,
        modelContext: ModelContext
    ) async {
        let dateString = PlanDateFormatting.isoDayString(from: raceDate)
        draftText = "I want to train for \(raceName), \(Self.distancePhrase(forMeters: distanceMeters)) on \(dateString). Priority: \(priority)."
        await send(modelContext: modelContext)
    }

    private static func distancePhrase(forMeters meters: Double) -> String {
        let km = meters / 1000
        if abs(km - 5) < 0.05 { return "a 5K" }
        if abs(km - 10) < 0.05 { return "a 10K" }
        if abs(km - 21.0975) < 0.1 { return "a half marathon" }
        if abs(km - 42.195) < 0.1 { return "a marathon" }
        return String(format: "a %.1fkm race", km)
    }

    /// Best-effort — the coach can still hold a conversation without this, it just won't know
    /// your recent training, so a failure here isn't surfaced as a chat error.
    func loadAthleteContext() async {
        guard athleteContext == nil else { return }
        let since = Calendar.current.date(byAdding: .day, value: -28, to: .now)
        let client = StravaAPIClient(authService: authService)
        guard let activities = try? await client.recentActivities(after: since) else { return }
        athleteContext = Self.summarize(activities)
    }

    func send(modelContext: ModelContext) async {
        let text = draftText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isSending else { return }
        draftText = ""
        errorMessage = nil

        let history = messages.map { ChatTurnDTO(role: $0.role.rawValue, content: $0.content) }
        messages.append(ChatMessage(role: .user, content: text))
        isSending = true
        defer { isSending = false }

        // Mode is auto-detected from persisted state, not an explicit toggle: once a plan exists,
        // follow-up turns transparently switch to adjust_plan — unless the athlete explicitly
        // chose to start a new plan (isStartingNewPlan), which forces create_plan regardless of
        // the stale plan still sitting in the store until this new one replaces it.
        let descriptor = FetchDescriptor<StoredTrainingPlan>(sortBy: [SortDescriptor(\.createdAt, order: .reverse)])
        let existingPlans = (try? modelContext.fetch(descriptor)) ?? []
        #if DEBUG
        if existingPlans.count > 1 {
            print("⚠️ multiple StoredTrainingPlan rows — using newest, race names: \(existingPlans.map(\.raceName))")
        }
        #endif
        let currentPlan = existingPlans.first

        do {
            let response = try await backend.sendCoachMessage(
                CoachMessageRequest(
                    mode: (currentPlan == nil || isStartingNewPlan) ? "create_plan" : "adjust_plan",
                    history: history,
                    message: text,
                    athleteContext: athleteContext,
                    currentPlan: currentPlan.map { plan in
                        CurrentPlanDTO(
                            raceName: plan.raceName,
                            raceDate: plan.raceDate,
                            distanceMeters: plan.distanceMeters,
                            priority: plan.priority,
                            planStartDate: plan.planStartDate,
                            planEndDate: plan.planEndDate,
                            workouts: plan.workouts.map { workout in
                                CurrentPlanWorkoutRefDTO(
                                    id: workout.id,
                                    date: workout.date,
                                    type: workout.typeRawValue,
                                    targetDistanceMeters: workout.targetDistanceMeters,
                                    targetDurationSeconds: workout.targetDurationSeconds,
                                    targetPaceSecPerKm: workout.targetPaceSecPerKm,
                                    description: workout.workoutDescription,
                                    coachNotes: workout.coachNotes
                                )
                            }
                        )
                    }
                )
            )
            if !response.text.isEmpty {
                messages.append(ChatMessage(role: .assistant, content: response.text))
            }
            if let plan = response.toolCall?.trainingPlan {
                createdPlan = plan
                isStartingNewPlan = false
                PlanStore.save(plan, in: modelContext)
            }
            if let adjustment = response.toolCall?.planAdjustment, let currentPlan {
                try PlanStore.apply(adjustment, to: currentPlan, in: modelContext)
                planWasUpdated = true
            }
        } catch {
            errorMessage = "Couldn't reach the coach: \(error.localizedDescription)"
        }
    }

    private static func summarize(_ activities: [StravaActivityDTO]) -> AthleteContextSummary {
        let runs = activities.filter { $0.type == "Run" }
        let totalKm = runs.reduce(0.0) { $0 + $1.distance / 1000 }
        let longestKm = runs.map { $0.distance / 1000 }.max() ?? 0
        return AthleteContextSummary(recentWeeklyDistanceKm: totalKm / 4, recentRunCount: runs.count, longestRecentRunKm: longestKm)
    }
}
