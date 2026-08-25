import SwiftUI
import UIKit

extension Color {
    /// Defines a color as separate light/dark component values rather than relying on an asset
    /// catalog entry, so the whole palette can live in one Swift file.
    init(light: Color, dark: Color) {
        self = Color(uiColor: UIColor(dynamicProvider: { traits in
            UIColor(traits.userInterfaceStyle == .dark ? dark : light)
        }))
    }

    /// Deep teal-green — distinct from Strava's orange branding and default iOS blue, fits a
    /// trail/running coach app. Lightened in dark mode so it still reads as vivid against a near-black
    /// background rather than sinking into it.
    static let racePaceAccent = Color(
        light: Color(red: 0.09, green: 0.45, blue: 0.36),
        dark: Color(red: 0.36, green: 0.78, blue: 0.64)
    )

    /// Deeper end of the accent gradient used on hero surfaces (onboarding, goal card).
    static let racePaceAccentDeep = Color(
        light: Color(red: 0.04, green: 0.22, blue: 0.19),
        dark: Color(red: 0.03, green: 0.16, blue: 0.14)
    )

    /// Warm off-white app background in light mode, warm near-black (not pure black) in dark —
    /// keeps screens from reading as plain system white/black.
    static let racePaceCanvas = Color(
        light: Color(red: 0.97, green: 0.96, blue: 0.93),
        dark: Color(red: 0.07, green: 0.08, blue: 0.08)
    )

    /// Card/surface fill, one step up from the canvas so cards read as distinct layers.
    static let racePaceCard = Color(
        light: Color.white,
        dark: Color(red: 0.13, green: 0.14, blue: 0.14)
    )

    /// Warm coral, used sparingly for emphasis (e.g. race day, streak highlights) so the palette
    /// isn't monochrome green.
    static let racePaceCoral = Color(
        light: Color(red: 0.82, green: 0.35, blue: 0.24),
        dark: Color(red: 0.92, green: 0.5, blue: 0.38)
    )

    /// Text/icon color for content sitting directly on the accent gradient — stays near-white in
    /// both modes since the gradient itself is always dark.
    static let racePaceOnAccent = Color(red: 0.98, green: 0.99, blue: 0.97)
}

// Mirrors SwiftUI's own pattern for named colors (`.red`, `.blue`, ...) so the palette can be
// used with the same leading-dot shorthand in `.foregroundStyle(...)`/`.background(...)` calls,
// not just as `Color.racePaceAccent`.
extension ShapeStyle where Self == Color {
    static var racePaceAccent: Color { .racePaceAccent }
    static var racePaceAccentDeep: Color { .racePaceAccentDeep }
    static var racePaceCanvas: Color { .racePaceCanvas }
    static var racePaceCard: Color { .racePaceCard }
    static var racePaceCoral: Color { .racePaceCoral }
    static var racePaceOnAccent: Color { .racePaceOnAccent }
}

extension LinearGradient {
    static let racePaceHero = LinearGradient(
        colors: [.racePaceAccent, .racePaceAccentDeep],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

extension View {
    /// Standard elevated card surface used across Plan, Workout detail, and Chat.
    func racePaceCard(padding: CGFloat = 16) -> some View {
        self
            .padding(padding)
            .background(Color.racePaceCard, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .shadow(color: .black.opacity(0.06), radius: 8, x: 0, y: 3)
    }

    /// Small-caps-style section label (e.g. "GOAL", "THIS WEEK") used above card groups.
    func racePaceSectionLabel() -> some View {
        self
            .font(.caption.weight(.bold))
            .tracking(0.8)
            .textCase(.uppercase)
            .foregroundStyle(.secondary)
    }
}

extension Font {
    /// Large bold rounded numerals for stats (pace, distance, duration) — gives the athletic-data
    /// screens (goal card, workout detail) a number-forward feel instead of plain body text.
    static func racePaceStat(_ size: CGFloat = 28) -> Font {
        .system(size: size, weight: .bold, design: .rounded)
    }
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
        case .race: .racePaceCoral
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
