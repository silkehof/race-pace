import SwiftUI

struct WorkoutDetailView: View {
    let workout: StoredWorkout

    var body: some View {
        ZStack {
            Color.racePaceCanvas.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 20) {
                    header

                    if hasStats {
                        statTiles
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Description").racePaceSectionLabel()
                        Text(workout.workoutDescription)
                            .font(.subheadline)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .racePaceCard()

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
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .racePaceCard()
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
                .foregroundStyle(.racePaceAccent)
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
