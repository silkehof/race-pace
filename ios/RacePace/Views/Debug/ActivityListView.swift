import SwiftUI

/// Throwaway proof-of-data-flow for Phase 3 — real activity display/matching UI lands in Phase 7.
struct ActivityListView: View {
    let authService: StravaAuthService

    @State private var activities: [StravaActivityDTO] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        List {
            if isLoading {
                ProgressView()
            } else if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            } else if activities.isEmpty {
                Text("No recent activities found.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(activities) { activity in
                    VStack(alignment: .leading) {
                        Text(activity.name).font(.headline)
                        Text(
                            "\(activity.type) · \(Int(activity.distance / 1000)) km · \(activity.startDate.formatted(date: .abbreviated, time: .omitted))"
                        )
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle("Recent Activities")
        .task { await load() }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let client = StravaAPIClient(authService: authService)
            activities = try await client.recentActivities()
        } catch {
            errorMessage = "Couldn't load activities: \(error.localizedDescription)"
        }
    }
}
