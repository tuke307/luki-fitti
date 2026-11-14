import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiStore

/// Avatar that loads its JPEG through the authenticated API client (API-relative
/// `/social/avatars/...` URL) with an initials circle as fallback.
struct SocialAvatarView: View {
    let userId: String
    let handle: String
    let name: String?
    let avatarUrl: String?
    let social: SocialStore
    var size: CGFloat = 44

    @State private var image: UIImage?
    @State private var didLoad = false

    private var initials: String {
        let source = (name?.trimmingCharacters(in: .whitespaces).isEmpty == false ? name : handle) ?? ""
        return source
            .split(separator: " ")
            .prefix(2)
            .compactMap { $0.first?.uppercased() }
            .joined()
    }

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                Text(initials.isEmpty ? "?" : initials)
                    .font(.system(size: size * 0.38, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: size, height: size)
        .background(LukiColors.fill)
        .clipShape(Circle())
        .task(id: avatarUrl) {
            if let data = await social.avatarData(for: userId, url: avatarUrl),
               let loaded = UIImage(data: data) {
                image = loaded
            }
            didLoad = true
        }
        .accessibilityHidden(true)
    }
}

/// One row for a `SocialCardDto`: avatar, @handle (+ name for friends), an optional
/// streak chip (flame + count, snowflake pips for freezes, weekly progress) and trailing
/// content.
struct SocialPersonRow<Actions: View>: View {
    let person: SocialCardDto
    let social: SocialStore
    var streak: FriendStreakDto? = nil
    @ViewBuilder var actions: () -> Actions
    @Environment(\.lukiLocale) private var tr

    var body: some View {
        HStack(spacing: 12) {
            SocialAvatarView(
                userId: person.userId,
                handle: person.handle,
                name: person.name,
                avatarUrl: person.avatarUrl,
                social: social
            )
            VStack(alignment: .leading, spacing: 2) {
                if let name = person.name, !name.isEmpty {
                    Text(name).font(.subheadline.weight(.semibold))
                }
                HStack(spacing: 6) {
                    Text("@\(person.handle)")
                        .font(.subheadline)
                        .foregroundStyle(person.name.map { !$0.isEmpty } == true ? .secondary : .primary)
                    if let streak, streak.status == .ACTIVE {
                        HStack(spacing: 2) {
                            Image(systemName: "flame.fill")
                            Text("\(streak.count)")
                            ForEach(0..<streak.freezes, id: \.self) { _ in
                                Image(systemName: "snowflake")
                                    .foregroundStyle(.cyan)
                            }
                        }
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.orange)
                        .accessibilityElement(children: .combine)
                        .accessibilityIdentifier("ios.streak.chip.\(person.userId)")
                    }
                }
                if let streak, streak.status == .ACTIVE {
                    Text(
                        tr(
                            "this week %d/%d · %d/%d",
                            streak.thisWeek.you.done, streak.thisWeek.you.target,
                            streak.thisWeek.them.done, streak.thisWeek.them.target
                        )
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("ios.streak.week.\(person.userId)")
                }
            }
            Spacer()
            actions()
        }
        .contentShape(Rectangle())
        .accessibilityIdentifier("ios.social.person.\(person.userId)")
    }
}
