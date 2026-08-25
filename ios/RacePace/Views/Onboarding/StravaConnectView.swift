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
        ZStack {
            Color.racePaceCanvas.ignoresSafeArea()

            VStack(spacing: 28) {
                Spacer()

                Image(systemName: "link.circle.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(.racePaceAccent)

                VStack(spacing: 10) {
                    Text("Connect Strava")
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                    Text("RacePace reads your recent training history from Strava to build and adapt your plan.")
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 32)
                }

                Spacer()

                VStack(spacing: 12) {
                    Button {
                        Task { await viewModel.connect() }
                    } label: {
                        HStack {
                            if viewModel.isConnecting {
                                ProgressView().tint(.racePaceOnAccent)
                            } else {
                                Text("Connect with Strava")
                                    .font(.headline)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                    }
                    .buttonStyle(.plain)
                    .background(.racePaceAccent, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .foregroundStyle(.racePaceOnAccent)
                    .disabled(viewModel.isConnecting)

                    if let errorMessage = viewModel.errorMessage {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .font(.footnote)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(.horizontal, 32)
                .padding(.bottom, 40)
            }
        }
        .navigationTitle("Strava")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack { StravaConnectView(authService: StravaAuthService()) }
}
