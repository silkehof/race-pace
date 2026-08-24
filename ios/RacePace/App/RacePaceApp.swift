import SwiftData
import SwiftUI

@main
struct RacePaceApp: App {
    var body: some Scene {
        WindowGroup {
            OnboardingFlowView()
        }
        .modelContainer(AppContainer.shared)
    }
}
