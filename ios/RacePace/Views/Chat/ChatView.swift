import SwiftUI

struct ChatView: View {
    @StateObject private var viewModel: ChatViewModel
    @Environment(\.modelContext) private var modelContext

    init(authService: StravaAuthService) {
        _viewModel = StateObject(wrappedValue: ChatViewModel(authService: authService))
    }

    var body: some View {
        ZStack {
            Color.racePaceCanvas.ignoresSafeArea()

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
                                    .foregroundStyle(.racePaceAccent)
                            }
                            if viewModel.isSending {
                                ProgressView().tint(.racePaceAccent)
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
                            .background(.racePaceAccent, in: Circle())
                    }
                    .disabled(viewModel.draftText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || viewModel.isSending)
                    .opacity(viewModel.draftText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || viewModel.isSending ? 0.4 : 1)
                }
                .padding(12)
            }
        }
        .navigationTitle("Coach")
        .task { await viewModel.loadAthleteContext() }
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
                    message.role == .user ? AnyShapeStyle(Color.racePaceAccent) : AnyShapeStyle(Color.racePaceCard),
                    in: RoundedRectangle(cornerRadius: 16, style: .continuous)
                )
            if message.role == .assistant { Spacer(minLength: 40) }
        }
    }
}
