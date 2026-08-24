import SwiftUI

struct ChatView: View {
    @StateObject private var viewModel: ChatViewModel
    @Environment(\.modelContext) private var modelContext

    init(authService: StravaAuthService) {
        _viewModel = StateObject(wrappedValue: ChatViewModel(authService: authService))
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        ForEach(viewModel.messages) { message in
                            bubble(for: message)
                        }
                        if viewModel.createdPlan != nil || viewModel.planWasUpdated {
                            Label("Saved — check the Plan tab", systemImage: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                        }
                        if viewModel.isSending {
                            ProgressView()
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

            HStack(alignment: .bottom) {
                TextField("Message your coach", text: $viewModel.draftText, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                Button("Send") { Task { await viewModel.send(modelContext: modelContext) } }
                    .disabled(viewModel.draftText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || viewModel.isSending)
            }
            .padding()
        }
        .navigationTitle("Coach")
        .task { await viewModel.loadAthleteContext() }
    }

    @ViewBuilder
    private func bubble(for message: ChatMessage) -> some View {
        HStack {
            if message.role == .user { Spacer(minLength: 40) }
            Text(message.content)
                .padding(10)
                .background(message.role == .user ? Color.accentColor.opacity(0.15) : Color.secondary.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 12))
            if message.role == .assistant { Spacer(minLength: 40) }
        }
    }
}
