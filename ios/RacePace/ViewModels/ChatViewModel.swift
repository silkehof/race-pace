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

    private let backend = BackendAPIClient()
    private let authService: StravaAuthService
    private var athleteContext: AthleteContextSummary?

    init(authService: StravaAuthService) {
        self.authService = authService
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
        // follow-up turns transparently switch to adjust_plan.
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
                    mode: currentPlan == nil ? "create_plan" : "adjust_plan",
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
