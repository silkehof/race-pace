import Foundation

/// Parses a strength workout's `description` against the line-based "Warm-up:/Main:/Cooldown:"
/// convention the coach prompt enforces (see backend/src/prompts/strengthWorkoutFormat.ts) — kept
/// in sync by hand, same as the rest of the coach<->app contract. Returns nil for anything that
/// doesn't match (e.g. a plan created before this convention existed), so callers can fall back to
/// showing the raw description rather than breaking on old data.
struct StrengthRoutine {
    let warmup: String
    let exercises: [String]
    let cooldown: String?

    static func parse(_ description: String) -> StrengthRoutine? {
        var warmup: String?
        var exercises: [String]?
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
                exercises = value.split(separator: ",")
                    .map { $0.trimmingCharacters(in: .whitespaces) }
                    .filter { !$0.isEmpty }
            case "cooldown", "cool-down":
                cooldown = value
            default:
                continue
            }
        }

        guard let warmup, let exercises, !exercises.isEmpty else { return nil }
        return StrengthRoutine(warmup: warmup, exercises: exercises, cooldown: cooldown)
    }
}
