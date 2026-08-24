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
                PlanView()
            }
            .tabItem { Label("Plan", systemImage: "calendar") }
        }
        .tint(.racePaceAccent)
    }
}

#Preview {
    MainTabView(authService: StravaAuthService())
}
