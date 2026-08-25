import SwiftData
import SwiftUI

@main
struct RacePaceApp: App {
    init() {
        AppearanceConfiguration.apply()
    }

    var body: some Scene {
        WindowGroup {
            OnboardingFlowView()
        }
        .modelContainer(AppContainer.shared)
    }
}
