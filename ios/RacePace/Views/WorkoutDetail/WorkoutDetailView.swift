import SwiftUI

struct WorkoutDetailView: View {
    let workout: StoredWorkout
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        ZStack {
            Color.racePaceCanvas.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 20) {
                    header

                    if workout.isCompleted {
                        completionCard
                    }

                    if hasStats {
                        statTiles
                    }

                    descriptionCard

                    if let notes = workout.coachNotes {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Coach notes").racePaceSectionLabel()
                            Text(notes)
                                .font(.subheadline)
                                .italic()
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .racePaceCard()
                    }
                }
                .padding(16)
            }
        }
        .navigationTitle(PlanDateFormatting.displayString(from: workout.date))
        .navigationBarTitleDisplayMode(.inline)
    }

    /// Only these types get the warm-up/main/cooldown phase breakdown — easy/long/recovery runs
    /// are one continuous effort with no distinct phases, so they stay a plain description (see
    /// runPhaseFormat.ts / strengthWorkoutFormat.ts, which only require this structure for these).
    private var isPhasedType: Bool {
        switch workout.type {
        case .strength, .tempo, .interval, .racePace: true
        default: false
        }
    }

    @ViewBuilder
    private var descriptionCard: some View {
        if isPhasedType, let phases = PhasedDescription.parse(workout.workoutDescription) {
            phasedCard(phases)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                Text("Description").racePaceSectionLabel()
                Text(workout.workoutDescription)
                    .font(.subheadline)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .racePaceCard()
        }
    }

    private func phasedCard(_ phases: PhasedDescription) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            routineSection(title: "Warm-up", icon: "flame.fill") {
                Text(phases.warmup).font(.subheadline)
            }

            routineSection(title: "Main", icon: workout.type == .strength ? "dumbbell.fill" : "bolt.fill") {
                if workout.type == .strength {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(phases.mainExercises, id: \.self) { exercise in
                            HStack(alignment: .top, spacing: 8) {
                                Circle()
                                    .fill(Color.racePaceCoral)
                                    .frame(width: 6, height: 6)
                                    .padding(.top, 6)
                                Text(exercise).font(.subheadline)
                            }
                        }
                    }
                } else {
                    Text(phases.main).font(.subheadline)
                }
            }

            if let cooldown = phases.cooldown {
                routineSection(title: "Cooldown", icon: "leaf.fill") {
                    Text(cooldown).font(.subheadline)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .racePaceCard()
    }

    private func routineSection(title: String, icon: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(title, systemImage: icon)
                .font(.caption.weight(.bold))
                .foregroundStyle(.racePaceCoral)
            content()
        }
    }

    private var hasStats: Bool {
        workout.targetDistanceMeters != nil || workout.targetDurationSeconds != nil
            || workout.targetPaceSecPerKm != nil
    }

    private var header: some View {
        HStack(spacing: 14) {
            Image(systemName: WorkoutStyle.symbol(for: workout.type))
                .font(.system(size: 26, weight: .semibold))
                .foregroundStyle(.racePaceOnAccent)
                .frame(width: 56, height: 56)
                .background(WorkoutStyle.color(for: workout.type), in: Circle())

            VStack(alignment: .leading, spacing: 2) {
                Text(WorkoutStyle.label(for: workout.type))
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                Text(PlanDateFormatting.displayString(from: workout.date))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Button {
                workout.isCompleted.toggle()
                try? modelContext.save()
            } label: {
                Image(systemName: workout.isCompleted ? "checkmark.circle.fill" : "circle")
                    .font(.title)
                    .foregroundStyle(workout.isCompleted ? .racePaceCoral : Color.secondary.opacity(0.4))
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .racePaceCard()
    }

    private var completionCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(
                workout.matchedStravaActivityId != nil ? "Matched from Strava" : "Marked complete",
                systemImage: "checkmark.seal.fill"
            )
            .font(.caption.weight(.bold))
            .foregroundStyle(.racePaceCoral)

            if let name = workout.matchedActivityName {
                Text(name)
                    .font(.subheadline.weight(.semibold))
            }

            if workout.matchedActivityDistanceMeters != nil || workout.matchedActivityDurationSeconds != nil {
                HStack(spacing: 24) {
                    if let distance = workout.matchedActivityDistanceMeters {
                        actualStat(value: String(format: "%.1f km", distance / 1000), label: "actual distance")
                    }
                    if let duration = workout.matchedActivityDurationSeconds {
                        actualStat(value: Self.formatDuration(duration), label: "actual duration")
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .racePaceCard()
    }

    private func actualStat(value: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.racePaceStat(18))
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
    }

    private var statTiles: some View {
        HStack(spacing: 12) {
            if let distance = workout.targetDistanceMeters {
                statTile(value: String(format: "%.1f", distance / 1000), unit: "km", icon: "ruler")
            }
            if let duration = workout.targetDurationSeconds {
                statTile(value: Self.formatDuration(duration), unit: "duration", icon: "clock")
            }
            if let pace = workout.targetPaceSecPerKm {
                statTile(value: Self.formatPace(pace), unit: "/km", icon: "speedometer")
            }
        }
    }

    private func statTile(value: String, unit: String, icon: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundStyle(.racePaceCoral)
            Text(value)
                .font(.racePaceStat(20))
            Text(unit)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .racePaceCard(padding: 0)
    }

    private static func formatDuration(_ seconds: Double) -> String {
        let totalMinutes = Int(seconds) / 60
        let hours = totalMinutes / 60
        let minutes = totalMinutes % 60
        return hours > 0 ? "\(hours)h \(minutes)m" : "\(minutes)m"
    }

    private static func formatPace(_ secPerKm: Double) -> String {
        let minutes = Int(secPerKm) / 60
        let seconds = Int(secPerKm) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

#Preview {
    NavigationStack {
        WorkoutDetailView(
            workout: StoredWorkout(
                id: UUID().uuidString,
                date: "2026-08-25",
                typeRawValue: "tempo",
                targetDistanceMeters: nil,
                targetDurationSeconds: 1200,
                targetPaceSecPerKm: 300,
                workoutDescription: "20 min tempo, first quality session of the block",
                coachNotes: "Ease into it — this is your first tempo run in a while."
            )
        )
    }
}
