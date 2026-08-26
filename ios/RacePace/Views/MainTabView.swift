import SwiftUI

struct MainTabView: View {
    let authService: StravaAuthService

    var body: some View {
        TabView {
            NavigationStack {
                ChatView(authService: authService)
            }
            .tabItem { Label("Coach", systemImage: "message.fill") }

            NavigationStack {
                PlanView(authService: authService)
            }
            .tabItem { Label("Plan", systemImage: "calendar") }
        }
        .tint(.racePaceCoral)
    }
}

#Preview {
    MainTabView(authService: StravaAuthService())
}
