import Foundation

@MainActor
final class StravaConnectViewModel: ObservableObject {
    @Published var isConnecting = false
    @Published var errorMessage: String?
    @Published private(set) var isConnected: Bool

    let authService: StravaAuthService

    init(authService: StravaAuthService) {
        self.authService = authService
        isConnected = authService.isConnected
    }

    func connect() async {
        isConnecting = true
        errorMessage = nil
        defer { isConnecting = false }
        do {
            try await authService.connect()
            isConnected = true
        } catch {
            errorMessage = "Couldn't connect to Strava: \(error.localizedDescription)"
        }
    }
}
