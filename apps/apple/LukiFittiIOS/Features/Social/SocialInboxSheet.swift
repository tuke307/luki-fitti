import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiStore
import LukiFittiDomain

/// In-app notifications inbox: newest first, cursor pagination, marked read when opened.
/// Title/body come rendered from the API in the UI locale; rows with a `payload.url`
/// deep-link into the matching social section.
struct SocialInboxSheet: View {
    @Bindable var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr
    @Environment(\.dismiss) private var dismiss

    @State private var items: [SocialNotificationDto] = []
    @State private var nextCursor: String?
    @State private var loading = false

    private var social: SocialStore { viewModel.social }

    var body: some View {
        List {
            if items.isEmpty && !loading {
                Text(tr("Nothing here yet."))
                    .foregroundStyle(.secondary)
            }
            ForEach(items) { item in
                row(for: item)
            }
            if nextCursor != nil {
                Button(tr("Load more")) { Task { await loadMore() } }
                    .disabled(loading)
                    .accessibilityIdentifier("ios.social.inbox.loadMore")
            }
        }
        .navigationTitle(tr("Notifications"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(tr("Done")) { dismiss() }
            }
        }
        .task {
            await loadMore()
            // Opening the inbox marks everything read (same as the web sheet).
            _ = try? await viewModel.store.apiClient.markNotificationsRead()
            await social.refreshUnread()
        }
    }

    @ViewBuilder
    private func row(for item: SocialNotificationDto) -> some View {
        let tappable = item.payload["url"] != nil
        let content = HStack(spacing: 12) {
            if let actor = item.actor {
                SocialAvatarView(
                    userId: actor.userId,
                    username: actor.username,
                    name: actor.name,
                    avatarUrl: actor.avatarUrl,
                    social: social,
                    size: 36
                )
            } else {
                Image(systemName: categoryIcon(for: item.kind))
                    .frame(width: 36, height: 36)
                    .background(LukiColors.fill)
                    .clipShape(Circle())
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                if !item.body.isEmpty {
                    Text(item.body)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                if let date = LukiDate.parseISO(item.createdAt) {
                    Text(date.formatted(date: .abbreviated, time: .shortened))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
            if item.readAt == nil {
                Circle()
                    .fill(LukiColors.accent)
                    .frame(width: 8, height: 8)
            }
        }
        if tappable {
            Button {
                open(item)
            } label: {
                content
            }
            .accessibilityIdentifier("ios.social.inbox.item.\(item.id)")
        } else {
            content
        }
    }

    private func categoryIcon(for kind: String) -> String {
        guard let kind = SocialNotificationKind(rawValue: kind) else { return "bell.fill" }
        switch NotificationCategories.category(of: kind).id {
        case .friends: return "person.2.fill"
        case .nudges: return "chart.line.uptrend.xyaxis"
        case .leagues: return "trophy.fill"
        case .duels: return "person.line.dotted.person.fill"
        case .streaks: return "flame.fill"
        case .raids: return "shield.fill"
        }
    }

    private func open(_ item: SocialNotificationDto) {
        guard let url = item.payload["url"] else { return }
        let target = SocialDeepLink.section(for: url)
        dismiss()
        switch target {
        case .social(let section):
            viewModel.openSocial(section: section)
        case .home:
            viewModel.openSocial(section: nil)
        }
    }

    private func loadMore() async {
        loading = true
        defer { loading = false }
        guard let page = try? await viewModel.store.apiClient.fetchNotifications(
            cursor: nextCursor,
            locale: viewModel.locale
        ) else { return }
        items.append(contentsOf: page.items)
        nextCursor = page.nextCursor
        social.unreadCount = page.unreadCount
    }
}
