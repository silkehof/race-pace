import SwiftUI

struct WelcomeView: View {
    let authService: StravaAuthService

    var body: some View {
        ZStack {
            LinearGradient.racePaceHero.ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer(minLength: 32)

                Image(systemName: "figure.run")
                    .font(.system(size: 56, weight: .semibold))
                    .foregroundStyle(.racePaceOnAccent)
                    .frame(width: 108, height: 108)
                    .background(.white.opacity(0.12), in: Circle())

                VStack(spacing: 8) {
                    Text("RacePace")
                        .font(.system(size: 40, weight: .bold, design: .rounded))
                        .foregroundStyle(.racePaceOnAccent)
                    Text("Your adaptive training coach")
                        .font(.title3)
                        .foregroundStyle(.racePaceOnAccent.opacity(0.8))
                }

                Spacer(minLength: 32)

                VStack(alignment: .leading, spacing: 14) {
                    featureRow(icon: "waveform.path.ecg", text: "Reads your recent training from Strava")
                    featureRow(icon: "text.bubble.fill", text: "Builds a race plan through conversation")
                    featureRow(icon: "arrow.triangle.2.circlepath", text: "Adapts automatically when you skip or reschedule")
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .padding(.horizontal, 28)

                Spacer(minLength: 32)

                NavigationLink {
                    StravaConnectView(authService: authService)
                } label: {
                    Text("Get Started")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.plain)
                .background(.racePaceOnAccent, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .foregroundStyle(.racePaceCharcoalDeep)
                .padding(.horizontal, 32)
                .padding(.bottom, 48)
            }
        }
        .toolbarBackground(.hidden, for: .navigationBar)
    }

    private func featureRow(icon: String, text: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(.racePaceOnAccent)
                .frame(width: 24)
            Text(text)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.racePaceOnAccent.opacity(0.95))
        }
    }
}

#Preview {
    NavigationStack { WelcomeView(authService: StravaAuthService()) }
}
