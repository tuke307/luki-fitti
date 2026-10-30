import SwiftUI
import Observation
import LukiFittiModels
import LukiFittiDesign

extension LukiAppViewModel {
    /// Saves preferences on this device and, when signed in, on the server.
    /// Returns an error message when the server rejected the change.
    func savePreferences(_ prefs: UserPreferencesDto, server dto: UpdatePreferencesDto) async -> String? {
        store.savePreferences(prefs)
        guard isSignedIn else { return nil }
        do {
            let user = try await store.apiClient.updatePreferences(dto)
            store.saveAuthenticatedUser(user)
            return nil
        } catch {
            return error.localizedDescription
        }
    }
}

/// Debounced auto-save for settings pages: the latest change wins, `flush` saves right away.
@MainActor
@Observable
final class PreferencesAutosaver {
    enum Status: Equatable {
        case idle, saving, saved
        case failed(String)
    }

    private(set) var status: Status = .idle
    @ObservationIgnored private var task: Task<Void, Never>?
    @ObservationIgnored private var pending: (@MainActor () async -> String?)?

    func schedule(after delay: Duration = .milliseconds(700), _ work: @escaping @MainActor () async -> String?) {
        task?.cancel()
        pending = work
        task = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            await self?.run()
        }
    }

    func flush() async {
        task?.cancel()
        task = nil
        await run()
    }

    /// Saves run one after another so an older server answer can't overwrite a newer change.
    @ObservationIgnored private var inFlight: Task<Void, Never>?

    private func run() async {
        guard let work = pending else { return }
        pending = nil
        status = .saving
        let previous = inFlight
        let current = Task { @MainActor [weak self] in
            await previous?.value
            let error = await work()
            self?.status = error.map(Status.failed) ?? .saved
        }
        inFlight = current
        await current.value
    }
}

/// Subtle "Saving… / Saved / error" line for auto-saving settings.
struct AutosaveStatusView: View {
    let status: PreferencesAutosaver.Status
    @Environment(\.lukiLocale) private var tr

    var body: some View {
        Group {
            switch status {
            case .idle:
                EmptyView()
            case .saving:
                Label(tr("Saving…"), systemImage: "arrow.triangle.2.circlepath")
                    .foregroundStyle(.secondary)
            case .saved:
                Label(tr("Saved"), systemImage: "checkmark.circle")
                    .foregroundStyle(.secondary)
            case .failed(let message):
                Label(tr("Couldn’t save: %@", message), systemImage: "exclamationmark.triangle")
                    .foregroundStyle(LukiColors.destructive)
            }
        }
        .font(.footnote)
        .animation(.default, value: status)
        .accessibilityIdentifier("ios.profile.autosaveStatus")
    }
}
