import Foundation

/// Workout/plan dates are plain "yyyy-MM-dd" strings with no time or timezone. Parsing them with
/// a locale/timezone-default DateFormatter risks off-by-one-day bucketing near midnight for some
/// users — everything here is pinned to a fixed UTC/Gregorian/POSIX calendar instead.
enum PlanDateFormatting {
    static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        calendar.locale = Locale(identifier: "en_US_POSIX")
        return calendar
    }()

    private static let isoDayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.locale = calendar.locale
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private static let displayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.locale = calendar.locale
        formatter.dateFormat = "EEE, MMM d"
        return formatter
    }()

    static func date(from isoDay: String) -> Date? {
        isoDayFormatter.date(from: isoDay)
    }

    static func isoDayString(from date: Date) -> String {
        isoDayFormatter.string(from: date)
    }

    static func displayString(from isoDay: String) -> String {
        guard let date = date(from: isoDay) else { return isoDay }
        return displayFormatter.string(from: date)
    }

    /// 0-based week index of `isoDay` relative to `startISODay`. Falls back to 0 if either date
    /// fails to parse (defensive — these strings are ajv-validated server-side, but a client-side
    /// parse failure shouldn't crash grouping).
    static func weekIndex(for isoDay: String, since startISODay: String) -> Int {
        guard let day = date(from: isoDay), let start = date(from: startISODay) else { return 0 }
        let days = calendar.dateComponents([.day], from: start, to: day).day ?? 0
        return max(0, days) / 7
    }
}
