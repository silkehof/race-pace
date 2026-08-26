import SwiftUI

/// A short structured form for the handful of facts every plan needs (race name, date, distance,
/// priority) — asking for these one bubble at a time in free chat was pure friction, since the
/// app already knows exactly what it needs before the coach can do anything useful. Everything
/// past this point (current training, preferred days, etc.) stays free-form chat, since that's
/// genuinely conversational and doesn't reduce to a fixed set of fields.
struct NewPlanIntakeView: View {
    let onCancel: (() -> Void)?
    let onSubmit: (_ raceName: String, _ raceDate: Date, _ distanceMeters: Double, _ priority: String) -> Void

    @State private var raceName = ""
    @State private var raceDate = Calendar.current.date(byAdding: .month, value: 3, to: .now) ?? .now
    @State private var distanceOption = DistanceOption.tenK
    @State private var customDistanceKm = ""
    @State private var priority = "A"

    private enum DistanceOption: String, CaseIterable, Identifiable {
        case fiveK = "5K", tenK = "10K", half = "Half", marathon = "Full", custom = "Custom"
        var id: String { rawValue }
        var meters: Double? {
            switch self {
            case .fiveK: 5000
            case .tenK: 10000
            case .half: 21097.5
            case .marathon: 42195
            case .custom: nil
            }
        }
    }

    private var resolvedDistanceMeters: Double? {
        distanceOption.meters ?? Double(customDistanceKm).flatMap { $0 > 0 ? $0 * 1000 : nil }
    }

    private var canSubmit: Bool {
        !raceName.trimmingCharacters(in: .whitespaces).isEmpty && resolvedDistanceMeters != nil
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                if let onCancel {
                    Button("Cancel", action: onCancel)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Let's set up your race")
                        .font(.system(size: 22, weight: .bold, design: .rounded))
                    Text("A few basics, then we'll talk through the rest.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                field(label: "Race name") {
                    TextField("e.g. City 10K", text: $raceName)
                        .padding(12)
                        .background(Color.racePaceCard, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }

                field(label: "Race date") {
                    DatePicker("Race date", selection: $raceDate, in: Date()..., displayedComponents: .date)
                        .datePickerStyle(.compact)
                        .labelsHidden()
                        .tint(.racePaceCoral)
                }

                field(label: "Distance") {
                    VStack(alignment: .leading, spacing: 10) {
                        Picker("Distance", selection: $distanceOption) {
                            ForEach(DistanceOption.allCases) { option in
                                Text(option.rawValue).tag(option)
                            }
                        }
                        .pickerStyle(.segmented)

                        if distanceOption == .custom {
                            HStack(spacing: 8) {
                                TextField("Distance", text: $customDistanceKm)
                                    .keyboardType(.decimalPad)
                                    .padding(12)
                                    .background(Color.racePaceCard, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                                Text("km").foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                field(label: "Priority") {
                    VStack(alignment: .leading, spacing: 6) {
                        Picker("Priority", selection: $priority) {
                            Text("A").tag("A")
                            Text("B").tag("B")
                            Text("C").tag("C")
                        }
                        .pickerStyle(.segmented)
                        Text(priorityHint)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Button {
                    guard let distanceMeters = resolvedDistanceMeters else { return }
                    onSubmit(raceName.trimmingCharacters(in: .whitespaces), raceDate, distanceMeters, priority)
                } label: {
                    Text("Start planning")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.plain)
                .background(.racePaceCharcoal, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .foregroundStyle(.racePaceOnAccent)
                .opacity(canSubmit ? 1 : 0.4)
                .disabled(!canSubmit)
            }
            .padding(20)
        }
        .background(Color.racePaceCanvas)
    }

    private var priorityHint: String {
        switch priority {
        case "A": "Primary goal race — the plan builds around this one."
        case "B": "Secondary race — meaningful, but not the main focus."
        default: "Low-key or tune-up race."
        }
    }

    private func field(label: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label).racePaceSectionLabel()
            content()
        }
    }
}

#Preview {
    NewPlanIntakeView(onCancel: {}, onSubmit: { _, _, _, _ in })
}
