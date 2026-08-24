import SwiftData
import SwiftUI

struct PlanView: View {
    @Query(sort: \StoredTrainingPlan.createdAt, order: .reverse) private var plans: [StoredTrainingPlan]

    private var plan: StoredTrainingPlan? { plans.first }

    var body: some View {
        Group {
            if let plan {
                planList(for: plan)
            } else {
                ContentUnavailableView(
                    "No plan yet",
                    systemImage: "calendar.badge.plus",
                    description: Text("Talk to your coach to build one.")
                )
            }
        }
        .navigationTitle("Your Plan")
    }

    @ViewBuilder
    private func planList(for plan: StoredTrainingPlan) -> some View {
        List {
            Section("Goal") {
                Text(plan.raceName).font(.headline)
                Text("\(Int(plan.distanceMeters / 1000)) km · \(PlanDateFormatting.displayString(from: plan.raceDate)) · Priority \(plan.priority)")
                    .foregroundStyle(.secondary)
            }
            Section("Coach's rationale") {
                Text(plan.rationale)
            }
            ForEach(weekGroups(for: plan)) { week in
                Section("Week \(week.index + 1) · \(week.totalKm, specifier: "%.1f") km planned") {
                    ForEach(week.days) { day in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(PlanDateFormatting.displayString(from: day.date))
                                .font(.caption.bold())
                                .foregroundStyle(.secondary)
                            // A day can hold more than one independent session (e.g. a run plus a
                            // strength session) — each gets its own row/detail, never merged.
                            ForEach(day.workouts) { workout in
                                NavigationLink(destination: WorkoutDetailView(workout: workout)) {
                                    workoutRow(workout)
                                }
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func workoutRow(_ workout: StoredWorkout) -> some View {
        HStack(spacing: 10) {
            Label(WorkoutStyle.label(for: workout.type), systemImage: WorkoutStyle.symbol(for: workout.type))
                .font(.caption.bold())
                .foregroundStyle(WorkoutStyle.color(for: workout.type))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(WorkoutStyle.color(for: workout.type).opacity(0.15))
                .clipShape(Capsule())
            Text(workout.workoutDescription)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }

    private struct DayGroup: Identifiable {
        let date: String
        let workouts: [StoredWorkout]
        var id: String { date }
    }

    private struct WeekGroup: Identifiable {
        let index: Int
        let days: [DayGroup]
        let totalKm: Double
        var id: Int { index }
    }

    private func weekGroups(for plan: StoredTrainingPlan) -> [WeekGroup] {
        let byWeek = Dictionary(grouping: plan.workouts) { workout in
            PlanDateFormatting.weekIndex(for: workout.date, since: plan.planStartDate)
        }
        return byWeek.keys.sorted().map { index in
            let workouts = byWeek[index] ?? []
            let byDay = Dictionary(grouping: workouts) { $0.date }
            let days = byDay.keys.sorted().map { date in
                DayGroup(date: date, workouts: byDay[date] ?? [])
            }
            let totalKm = workouts.reduce(0.0) { $0 + $1.estimatedDistanceMeters / 1000 }
            return WeekGroup(index: index, days: days, totalKm: totalKm)
        }
    }
}

#Preview {
    NavigationStack {
        PlanView()
    }
    .modelContainer(for: [StoredTrainingPlan.self, StoredWorkout.self], inMemory: true)
}
