import SwiftData
import SwiftUI

struct PlanView: View {
    @Query(sort: \StoredTrainingPlan.createdAt, order: .reverse) private var plans: [StoredTrainingPlan]

    private var plan: StoredTrainingPlan? { plans.first }

    var body: some View {
        ZStack {
            Color.racePaceCanvas.ignoresSafeArea()

            if let plan {
                planScroll(for: plan)
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
    private func planScroll(for plan: StoredTrainingPlan) -> some View {
        ScrollView {
            VStack(spacing: 20) {
                goalCard(for: plan)
                rationaleCard(for: plan)
                ForEach(weekGroups(for: plan)) { week in
                    weekCard(week)
                }
            }
            .padding(16)
        }
    }

    @ViewBuilder
    private func goalCard(for plan: StoredTrainingPlan) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("GOAL")
                    .font(.caption.weight(.bold))
                    .tracking(0.8)
                    .foregroundStyle(.racePaceOnAccent.opacity(0.75))
                Spacer()
                Text("PRIORITY \(plan.priority)")
                    .font(.caption.weight(.bold))
                    .tracking(0.6)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(.white.opacity(0.16), in: Capsule())
                    .foregroundStyle(.racePaceOnAccent)
            }

            Text(plan.raceName)
                .font(.system(size: 26, weight: .bold, design: .rounded))
                .foregroundStyle(.racePaceOnAccent)

            HStack(spacing: 28) {
                statColumn(value: "\(Int(plan.distanceMeters / 1000))", unit: "km")
                statColumn(value: PlanDateFormatting.displayString(from: plan.raceDate), unit: "race day")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(LinearGradient.racePaceHero, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: .black.opacity(0.12), radius: 12, x: 0, y: 6)
    }

    private func statColumn(value: String, unit: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.racePaceStat(22))
                .foregroundStyle(.racePaceOnAccent)
            Text(unit)
                .font(.caption)
                .foregroundStyle(.racePaceOnAccent.opacity(0.75))
        }
    }

    @ViewBuilder
    private func rationaleCard(for plan: StoredTrainingPlan) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Coach's rationale").racePaceSectionLabel()
            Text(plan.rationale)
                .font(.subheadline)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .racePaceCard()
    }

    @ViewBuilder
    private func weekCard(_ week: WeekGroup) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Week \(week.index + 1)")
                    .font(.headline)
                Spacer()
                Text("\(week.totalKm, specifier: "%.1f") km planned")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.racePaceAccent)
            }

            ForEach(week.days) { day in
                VStack(alignment: .leading, spacing: 8) {
                    Text(PlanDateFormatting.displayString(from: day.date))
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                    // A day can hold more than one independent session (e.g. a run plus a
                    // strength session) — each gets its own row/detail, never merged.
                    ForEach(day.workouts) { workout in
                        NavigationLink(destination: WorkoutDetailView(workout: workout)) {
                            workoutRow(workout)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .racePaceCard()
    }

    @ViewBuilder
    private func workoutRow(_ workout: StoredWorkout) -> some View {
        HStack(spacing: 10) {
            Image(systemName: WorkoutStyle.symbol(for: workout.type))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(WorkoutStyle.color(for: workout.type))
                .frame(width: 30, height: 30)
                .background(WorkoutStyle.color(for: workout.type).opacity(0.15), in: Circle())

            VStack(alignment: .leading, spacing: 1) {
                Text(WorkoutStyle.label(for: workout.type))
                    .font(.subheadline.weight(.semibold))
                Text(rowSubtitle(for: workout))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 10)
        .background(Color.racePaceCanvas, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func rowSubtitle(for workout: StoredWorkout) -> String {
        guard workout.type == .strength, let routine = StrengthRoutine.parse(workout.workoutDescription) else {
            return workout.workoutDescription
        }
        let count = routine.exercises.count
        return "\(count) exercise\(count == 1 ? "" : "s") · \(routine.exercises.first ?? "")"
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
