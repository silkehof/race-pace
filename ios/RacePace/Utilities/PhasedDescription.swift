import Foundation

/// Parses a workout's `description` against the line-based "Warm-up:/Main:/Cooldown:" convention
/// the coach prompt enforces for both strength workouts (backend/src/prompts/strengthWorkoutFormat.ts)
/// and quality running workouts — tempo, interval, race_pace (backend/src/prompts/runPhaseFormat.ts).
/// Kept in sync with those by hand, same as the rest of the coach<->app contract. Returns nil for
/// anything that doesn't match (e.g. a plan created before this convention existed, or an easy/long
/// run that's deliberately single-phase prose), so callers can fall back to showing the raw
/// description rather than breaking on non-conforming data.
struct PhasedDescription {
    let warmup: String
    /// Raw `Main:` line content. Strength callers split this on "," into a per-exercise list;
    /// running callers show it as one paragraph, since a tempo/interval block is one continuous
    /// effort described in a sentence, not a list of discrete items.
    let main: String
    let cooldown: String?

    var mainExercises: [String] {
        main.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }

    static func parse(_ description: String) -> PhasedDescription? {
        var warmup: String?
        var main: String?
        var cooldown: String?

        for rawLine in description.split(separator: "\n", omittingEmptySubsequences: true) {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            guard let colonIndex = line.firstIndex(of: ":") else { continue }
            let label = line[..<colonIndex].trimmingCharacters(in: .whitespaces).lowercased()
            let value = line[line.index(after: colonIndex)...].trimmingCharacters(in: .whitespaces)
            guard !value.isEmpty else { continue }

            switch label {
            case "warm-up", "warmup":
                warmup = value
            case "main":
                main = value
            case "cooldown", "cool-down":
                cooldown = value
            default:
                continue
            }
        }

        guard let warmup, let main else { return nil }
        return PhasedDescription(warmup: warmup, main: main, cooldown: cooldown)
    }
}
