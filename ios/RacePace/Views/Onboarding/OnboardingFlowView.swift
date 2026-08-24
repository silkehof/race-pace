import SwiftUI

struct OnboardingFlowView: View {
    @State private var authService = StravaAuthService()

    var body: some View {
        if authService.isConnected {
            MainTabView(authService: authService)
        } else {
            NavigationStack {
                WelcomeView(authService: authService)
            }
        }
    }
}

#Preview {
    OnboardingFlowView()
}
