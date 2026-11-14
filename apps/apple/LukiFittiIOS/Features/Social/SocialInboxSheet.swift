import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiStore

/// In-app notifications inbox: newest first, cursor pagination, marked read when opened.
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
                HStack(spacing: 12) {
                    if let actor = item.actor {
                        SocialAvatarView(
                            userId: actor.userId,
                            handle: actor.handle,
                            name: actor.name,
                            avatarUrl: actor.avatarUrl,
                            social: social,
                            size: 36
                        )
                    } else {
                        Image(systemName: "bell.fill")
                            .frame(width: 36, height: 36)
                            .background(LukiColors.fill)
                            .clipShape(Circle())
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(text(for: item))
                            .font(.subheadline)
                        if let date = LukiDate.parseISO(item.createdAt) {
                            Text(date.formatted(date: .abbreviated, time: .shortened))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
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

    private func text(for item: SocialNotificationDto) -> String {
        var actor = tr("Someone")
        if let handle = item.actor?.handle { actor = "@\(handle)" }
        switch item.kind {
        case SocialNotificationKind.FRIEND_REQUEST.rawValue:
            return tr("%@ sent you a friend request.", actor)
        case SocialNotificationKind.FRIEND_ACCEPTED.rawValue:
            return tr("%@ accepted your friend request.", actor)
        default:
            return tr("You have a new notification.")
        }
    }

    private func loadMore() async {
        loading = true
        defer { loading = false }
        guard let page = try? await viewModel.store.apiClient.fetchNotifications(cursor: nextCursor) else { return }
        items.append(contentsOf: page.items)
        nextCursor = page.nextCursor
        social.unreadCount = page.unreadCount
    }
}
