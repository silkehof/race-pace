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
    /// When the in-flight turn started, so the UI can reassure rather than just spin. Building a
    /// plan is minutes of work with no intermediate output, and an unchanging spinner for that
    /// long reads as a hang.
    @Published private(set) var sendingStartedAt: Date?
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
    /// Captured from the guided intake so the backend can turn the athlete's benchmark effort
    /// into an equivalent time for this specific race distance (see CoachMessageRequest).
    private var goalDistanceMeters: Double?
    /// Optional, and only from the intake — the coach checks it against what the athlete's recent
    /// running implies rather than training them at a pace they can't yet hold.
    private var goalTimeSeconds: Int?

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
        goalDistanceMeters = nil
        goalTimeSeconds = nil
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
        goalTimeSeconds: Int?,
        modelContext: ModelContext
    ) async {
        let dateString = PlanDateFormatting.isoDayString(from: raceDate)
        goalDistanceMeters = distanceMeters
        self.goalTimeSeconds = goalTimeSeconds
        let goalPhrase = goalTimeSeconds.map { " Goal time: \(Self.timePhrase(seconds: $0))." } ?? ""
        draftText = "I want to train for \(raceName), \(Self.distancePhrase(forMeters: distanceMeters)) on \(dateString). Priority: \(priority).\(goalPhrase)"
        await send(modelContext: modelContext)
    }

    private static func timePhrase(seconds: Int) -> String {
        let hours = seconds / 3600, minutes = (seconds % 3600) / 60, secs = seconds % 60
        return hours > 0
            ? String(format: "%d:%02d:%02d", hours, minutes, secs)
            : String(format: "%d:%02d", minutes, secs)
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
    ///
    /// The window is wider than the 28 days the volume figures are drawn from, because a usable
    /// performance benchmark — the thing that stops the coach inventing paces — may be a parkrun
    /// or race from a couple of months back. `summarize` slices the shorter windows out of it.
    func loadAthleteContext() async {
        guard athleteContext == nil else { return }
        let since = Calendar.current.date(byAdding: .day, value: -Self.benchmarkWindowDays, to: .now)
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
        sendingStartedAt = .now
        defer {
            isSending = false
            sendingStartedAt = nil
        }

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
                    // The intake sets this while a plan is being created; once one exists the
                    // stored plan is the better source, and it survives an app relaunch where the
                    // in-memory intake value does not.
                    goalDistanceMeters: currentPlan?.distanceMeters ?? goalDistanceMeters,
                    goalTimeSeconds: goalTimeSeconds,
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

    /// How far back to look for a performance benchmark. Beyond this, a result describes a
    /// different athlete — matching the backend's own staleness cutoff in paceEngine.ts.
    private static let benchmarkWindowDays = 120
    /// Shorter than the benchmark window: this is the athlete's *current* training, which is what
    /// a plan's opening volume and frequency should continue from.
    private static let volumeWindowDays = 28
    /// The rolling window the single-session spike guard measures against (Frandsen et al. 2025).
    private static let spikeWindowDays = 30
    /// Below this, an effort is too short for the VDOT curve to say anything useful — the backend
    /// rejects them too, so there's no point sending them.
    private static let minBenchmarkMeters: Double = 3000

    /// Treadmill and virtual runs are running, and every volume figure below counts them: they are
    /// real training load, and leaving them out understated a treadmill runner's base badly enough
    /// to disable the backend's spike guard, which measures against their longest recent run.
    /// Whether such an effort can serve as a *performance* benchmark is a separate question, and
    /// one the backend answers — see benchmarkCandidates.
    private static let runActivityTypes: Set<String> = ["Run", "VirtualRun"]

    private static func summarize(_ activities: [StravaActivityDTO], now: Date = .now) -> AthleteContextSummary {
        let calendar = Calendar.current
        let runs = activities.filter { runActivityTypes.contains($0.type) && $0.distance > 0 }

        let volumeCutoff = calendar.date(byAdding: .day, value: -volumeWindowDays, to: now) ?? now
        let recent = runs.filter { $0.startDate >= volumeCutoff }
        let totalKm = recent.reduce(0.0) { $0 + $1.distance / 1000 }
        let runDays = Set(recent.map { calendar.startOfDay(for: $0.startDate) }).count

        let spikeCutoff = calendar.date(byAdding: .day, value: -spikeWindowDays, to: now) ?? now
        let longestRecentKm = runs.filter { $0.startDate >= spikeCutoff }.map { $0.distance / 1000 }.max() ?? 0

        let weeks = Double(volumeWindowDays) / 7
        return AthleteContextSummary(
            recentWeeklyDistanceKm: totalKm / weeks,
            recentRunCount: recent.count,
            runDaysPerWeek: Double(runDays) / weeks,
            longestRunLast30DaysKm: longestRecentKm,
            benchmarkCandidates: benchmarkCandidates(from: runs)
        )
    }

    /// Narrows the athlete's history down to the handful of efforts worth evaluating as a
    /// performance benchmark: the fastest run in each distance band, plus anything whose title
    /// reads like a race. Bands matter because pace alone can't rank efforts of different lengths
    /// — a fast 5K and a strong 18km are incomparable here, but not to the backend's VDOT
    /// calculation, so the job of this method is only to avoid throwing away the contenders.
    private static func benchmarkCandidates(from runs: [StravaActivityDTO]) -> [BenchmarkEffortDTO] {
        let eligible = runs.filter { $0.distance >= minBenchmarkMeters && $0.movingTime > 0 }
        func pace(_ run: StravaActivityDTO) -> Double { Double(run.movingTime) / run.distance }

        // Band winners are picked from outdoor runs only. The backend rejects treadmill efforts as
        // benchmarks anyway, so letting one win its band would just spend the slot on something
        // that gets thrown away, losing the best real candidate at that distance.
        let outdoor = eligible.filter { !$0.isTreadmill }
        let bands: [Range<Double>] = [3000..<7000, 7000..<15000, 15000..<Double.greatestFiniteMagnitude]
        var picked = bands.compactMap { band in
            outdoor.filter { band.contains($0.distance) }.min(by: { pace($0) < pace($1) })
        }

        // A race is the benchmark worth having even when a training run in the same band was
        // nominally faster, so pull the fastest race-titled efforts in regardless of the bands.
        let raceLike = outdoor
            .filter { $0.name.range(of: "race|parkrun|park run|time ?trial|championship", options: [.regularExpression, .caseInsensitive]) != nil }
            .sorted { pace($0) < pace($1) }
            .prefix(2)
        picked.append(contentsOf: raceLike)

        // One treadmill effort still goes along, flagged. It won't be used, but it lets the coach
        // say why an athlete who has clearly been training has no usable benchmark, rather than
        // telling them nothing was found.
        if let bestIndoor = eligible.filter({ $0.isTreadmill }).min(by: { pace($0) < pace($1) }) {
            picked.append(bestIndoor)
        }

        var seen = Set<Int>()
        return picked
            .filter { seen.insert($0.id).inserted }
            .map { run in
                BenchmarkEffortDTO(
                    date: PlanDateFormatting.isoDayString(from: run.startDate),
                    name: run.name,
                    distanceMeters: run.distance,
                    durationSeconds: run.movingTime,
                    elevationGainMeters: run.totalElevationGain,
                    elevationRangeMeters: run.elevationHigh.flatMap { high in run.elevationLow.map { high - $0 } },
                    isTreadmill: run.isTreadmill
                )
            }
    }
}
