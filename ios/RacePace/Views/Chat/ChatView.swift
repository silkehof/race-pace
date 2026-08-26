import SwiftData
import SwiftUI

struct ChatView: View {
    @StateObject private var viewModel: ChatViewModel
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \StoredTrainingPlan.createdAt, order: .reverse) private var plans: [StoredTrainingPlan]

    /// Whether the athlete has chosen to keep talking about the existing plan — only meaningful
    /// (and only asked) when a plan already exists; a brand new athlete skips straight to guided
    /// intake, see `screenState`.
    @State private var choseToContinueExisting = false

    private var existingPlan: StoredTrainingPlan? { plans.first }

    init(authService: StravaAuthService) {
        _viewModel = StateObject(wrappedValue: ChatViewModel(authService: authService))
    }

    private enum ScreenState {
        case choosingPlanAction
        case guidedIntake
        case chat
    }

    private var screenState: ScreenState {
        // Once the conversation has actually started, stay in chat regardless of how it began —
        // otherwise a mid-flow re-render (e.g. tab switch) could yank the athlete back to a
        // prompt screen partway through answering it.
        if !viewModel.messages.isEmpty { return .chat }
        if existingPlan == nil { return .guidedIntake }
        if viewModel.isStartingNewPlan { return .guidedIntake }
        if choseToContinueExisting { return .chat }
        return .choosingPlanAction
    }

    var body: some View {
        ZStack {
            Color.racePaceCanvas.ignoresSafeArea()

            switch screenState {
            case .choosingPlanAction:
                planActionPrompt
            case .guidedIntake:
                NewPlanIntakeView(
                    onCancel: existingPlan != nil ? { viewModel.cancelNewPlan() } : nil,
                    onSubmit: { raceName, raceDate, distanceMeters, priority in
                        Task {
                            await viewModel.submitGuidedIntake(
                                raceName: raceName,
                                raceDate: raceDate,
                                distanceMeters: distanceMeters,
                                priority: priority,
                                modelContext: modelContext
                            )
                        }
                    }
                )
            case .chat:
                chatBody
            }
        }
        .navigationTitle("Coach")
        .task { await viewModel.loadAthleteContext() }
    }

    private var planActionPrompt: some View {
        VStack(spacing: 20) {
            Spacer()

            VStack(spacing: 8) {
                Image(systemName: "figure.run.circle.fill")
                    .font(.system(size: 44))
                    .foregroundStyle(.racePaceCoral)
                Text(existingPlan?.raceName ?? "Your plan")
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                Text("What would you like to do?")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            VStack(spacing: 12) {
                Button {
                    choseToContinueExisting = true
                } label: {
                    Text("Continue coaching me on this plan")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.plain)
                .background(.racePaceCharcoal, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .foregroundStyle(.racePaceOnAccent)

                Button {
                    viewModel.beginNewPlan()
                } label: {
                    Text("Start a new plan")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.plain)
                .background(Color.racePaceCard, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .strokeBorder(Color.primary.opacity(0.1), lineWidth: 1)
                )
                .foregroundStyle(.primary)
            }
            .padding(.horizontal, 32)

            Spacer()
        }
    }

    private var chatBody: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        ForEach(viewModel.messages) { message in
                            bubble(for: message)
                        }
                        if viewModel.createdPlan != nil || viewModel.planWasUpdated {
                            Label("Saved — check the Plan tab", systemImage: "checkmark.circle.fill")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.racePaceCoral)
                        }
                        if viewModel.isSending {
                            ProgressView().tint(.racePaceCoral)
                        }
                    }
                    .padding()
                    .id("bottom")
                }
                .onChange(of: viewModel.messages.count) {
                    withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
                }
            }

            if let errorMessage = viewModel.errorMessage {
                Text(errorMessage)
                    .foregroundStyle(.red)
                    .font(.footnote)
                    .padding(.horizontal)
            }

            HStack(alignment: .bottom, spacing: 10) {
                TextField("Message your coach", text: $viewModel.draftText, axis: .vertical)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Color.racePaceCard, in: RoundedRectangle(cornerRadius: 18, style: .continuous))

                Button {
                    Task { await viewModel.send(modelContext: modelContext) }
                } label: {
                    Image(systemName: "arrow.up")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.racePaceOnAccent)
                        .frame(width: 36, height: 36)
                        .background(.racePaceCharcoal, in: Circle())
                }
                .disabled(viewModel.draftText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || viewModel.isSending)
                .opacity(viewModel.draftText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || viewModel.isSending ? 0.4 : 1)
            }
            .padding(12)
        }
    }

    @ViewBuilder
    private func bubble(for message: ChatMessage) -> some View {
        HStack {
            if message.role == .user { Spacer(minLength: 40) }
            Text(message.content)
                .font(.subheadline)
                .foregroundStyle(message.role == .user ? .racePaceOnAccent : .primary)
                .padding(12)
                .background(
                    message.role == .user ? AnyShapeStyle(Color.racePaceCharcoal) : AnyShapeStyle(Color.racePaceCard),
                    in: RoundedRectangle(cornerRadius: 16, style: .continuous)
                )
            if message.role == .assistant { Spacer(minLength: 40) }
        }
    }
}
