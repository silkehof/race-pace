import SwiftUI

struct StravaConnectView: View {
    @StateObject private var viewModel: StravaConnectViewModel

    init(authService: StravaAuthService) {
        _viewModel = StateObject(wrappedValue: StravaConnectViewModel(authService: authService))
    }

    var body: some View {
        Group {
            if viewModel.isConnected {
                MainTabView(authService: viewModel.authService)
            } else {
                connectPrompt
            }
        }
    }

    private var connectPrompt: some View {
        VStack(spacing: 20) {
            Text("Connect Strava")
                .font(.title.bold())
            Text("RacePace reads your recent training history from Strava to build and adapt your plan.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal)

            Button {
                Task { await viewModel.connect() }
            } label: {
                if viewModel.isConnecting {
                    ProgressView()
                } else {
                    Text("Connect with Strava")
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(viewModel.isConnecting)

            if let errorMessage = viewModel.errorMessage {
                Text(errorMessage)
                    .foregroundStyle(.red)
                    .font(.footnote)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
        }
        .padding()
        .navigationTitle("Strava")
    }
}

#Preview {
    NavigationStack { StravaConnectView(authService: StravaAuthService()) }
}
