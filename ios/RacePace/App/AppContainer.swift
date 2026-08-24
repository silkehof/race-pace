import SwiftData

enum AppContainer {
    static let shared: ModelContainer = {
        let schema = Schema([CachedStravaActivity.self, StoredTrainingPlan.self, StoredWorkout.self])
        let configuration = ModelConfiguration(schema: schema)
        do {
            return try ModelContainer(for: schema, configurations: [configuration])
        } catch {
            fatalError("Failed to create ModelContainer: \(error)")
        }
    }()
}
