import SwiftUI

struct WelcomeView: View {
    let authService: StravaAuthService

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: "figure.run")
                .font(.system(size: 48))
            Text("RacePace")
                .font(.largeTitle.bold())
            Text("Your adaptive training coach")
                .foregroundStyle(.secondary)
            Spacer()
            NavigationLink("Get Started") {
                StravaConnectView(authService: authService)
            }
            .buttonStyle(.borderedProminent)
            .padding(.bottom, 40)
        }
        .padding()
    }
}

#Preview {
    NavigationStack { WelcomeView(authService: StravaAuthService()) }
}
