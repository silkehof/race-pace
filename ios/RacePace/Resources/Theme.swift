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

    /// Primary structural "ink" color for large fills — buttons, message bubbles, hero gradients.
    /// Intentionally constant across light/dark mode (not theme-adaptive like the rest of the
    /// palette): a solid CTA color that shifts with system appearance reads as broken, not
    /// theme-aware, so this stays a fixed dark neutral either way.
    static let racePaceCharcoal = Color(red: 0.17, green: 0.17, blue: 0.19)

    /// Deeper end of the charcoal gradient/fills — also constant, see racePaceCharcoal.
    static let racePaceCharcoalDeep = Color(red: 0.07, green: 0.07, blue: 0.08)

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

    /// The "pop" accent — warm coral used for icon tints, stat highlights, badges, and small
    /// interactive accents (tab tint, spinners), and for the race-day workout category (the two
    /// uses sharing one color is deliberate — race day is the app's central moment, so it gets
    /// the app's own accent rather than a color from the generic per-type palette below).
    /// Deliberately not used as a large solid fill: too light/mid-saturation to pair with white
    /// text at button size, so big fills (buttons, message bubbles, hero surfaces) use
    /// racePaceCharcoal instead.
    static let racePaceCoral = Color(
        light: Color(red: 0.82, green: 0.35, blue: 0.24),
        dark: Color(red: 0.92, green: 0.5, blue: 0.38)
    )

    /// Text/icon color for content sitting directly on a charcoal fill — stays near-white in both
    /// modes since charcoal itself is always dark.
    static let racePaceOnAccent = Color(red: 0.98, green: 0.99, blue: 0.97)
}

// Mirrors SwiftUI's own pattern for named colors (`.red`, `.blue`, ...) so the palette can be
// used with the same leading-dot shorthand in `.foregroundStyle(...)`/`.background(...)` calls,
// not just as `Color.racePaceCoral`.
extension ShapeStyle where Self == Color {
    static var racePaceCharcoal: Color { .racePaceCharcoal }
    static var racePaceCharcoalDeep: Color { .racePaceCharcoalDeep }
    static var racePaceCanvas: Color { .racePaceCanvas }
    static var racePaceCard: Color { .racePaceCard }
    static var racePaceCoral: Color { .racePaceCoral }
    static var racePaceOnAccent: Color { .racePaceOnAccent }
}

extension LinearGradient {
    static let racePaceHero = LinearGradient(
        colors: [.racePaceCharcoal, .racePaceCharcoalDeep],
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
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .strokeBorder(Color.primary.opacity(0.06), lineWidth: 1)
            )
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
/// redundantly so it reads correctly without relying on hue discrimination. This is a distinct
/// palette from the app's charcoal/coral theme by design — ten categories need to stay visually
/// distinguishable from each other, which a two-color brand palette can't do on its own. (race
/// day is the one deliberate exception — see racePaceCoral.)
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
