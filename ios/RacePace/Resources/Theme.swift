import SwiftUI

extension Color {
    /// Deep green/teal — distinct from Strava's own orange branding and default iOS blue, fits a
    /// trail/running coach app. Applied via .tint(...) in MainTabView.
    static let racePaceAccent = Color(red: 0.12, green: 0.48, blue: 0.36)
}

/// Maps each workout category to a color + SF Symbol + label. Color alone is a real accessibility
/// gap for colorblind users (e.g. .blue vs .indigo look alike) — the symbol carries the category
/// redundantly so it reads correctly without relying on hue discrimination.
enum WorkoutStyle {
    static func color(for type: WorkoutType) -> Color {
        switch type {
        case .easyRun: .green
        case .longRun: .blue
        case .tempo: .orange
        case .interval: .red
        case .racePace: .purple
        case .recovery: .mint
        case .crossTrain: .indigo
        case .strength: .brown
        case .rest: .gray
        case .race: .yellow
        }
    }

    static func symbol(for type: WorkoutType) -> String {
        switch type {
        case .easyRun: "figure.run"
        case .longRun: "figure.run.circle.fill"
        case .tempo: "flame.fill"
        case .interval: "bolt.fill"
        case .racePace: "flag.checkered"
        case .recovery: "leaf.fill"
        case .crossTrain: "figure.strengthtraining.traditional"
        case .strength: "dumbbell.fill"
        case .rest: "bed.double.fill"
        case .race: "trophy.fill"
        }
    }

    static func label(for type: WorkoutType) -> String {
        switch type {
        case .easyRun: "Easy Run"
        case .longRun: "Long Run"
        case .tempo: "Tempo"
        case .interval: "Interval"
        case .racePace: "Race Pace"
        case .recovery: "Recovery"
        case .crossTrain: "Cross Train"
        case .strength: "Strength"
        case .rest: "Rest"
        case .race: "Race Day"
        }
    }
}
