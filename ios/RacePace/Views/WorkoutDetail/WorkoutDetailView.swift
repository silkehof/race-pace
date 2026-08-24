import SwiftUI

struct WorkoutDetailView: View {
    let workout: StoredWorkout

    var body: some View {
        List {
            Section {
                Label(WorkoutStyle.label(for: workout.type), systemImage: WorkoutStyle.symbol(for: workout.type))
                    .font(.headline)
                    .foregroundStyle(WorkoutStyle.color(for: workout.type))
            }
            Section("Details") {
                LabeledContent("Date", value: PlanDateFormatting.displayString(from: workout.date))
                if let distance = workout.targetDistanceMeters {
                    LabeledContent("Distance", value: String(format: "%.1f km", distance / 1000))
                }
                if let duration = workout.targetDurationSeconds {
                    LabeledContent("Duration", value: Self.formatDuration(duration))
                }
                if let pace = workout.targetPaceSecPerKm {
                    LabeledContent("Target pace", value: "\(Self.formatPace(pace)) /km")
                }
            }
            Section("Description") {
                Text(workout.workoutDescription)
            }
            if let notes = workout.coachNotes {
                Section("Coach notes") {
                    Text(notes).italic()
                }
            }
        }
        .navigationTitle(PlanDateFormatting.displayString(from: workout.date))
    }

    private static func formatDuration(_ seconds: Double) -> String {
        let totalMinutes = Int(seconds) / 60
        let hours = totalMinutes / 60
        let minutes = totalMinutes % 60
        return hours > 0 ? "\(hours)h \(minutes)m" : "\(minutes) min"
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
