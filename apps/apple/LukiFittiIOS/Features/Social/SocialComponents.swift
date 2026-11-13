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

/// One row for a `SocialCardDto`: avatar, @handle (+ name for friends) and trailing content.
struct SocialPersonRow<Actions: View>: View {
    let person: SocialCardDto
    let social: SocialStore
    @ViewBuilder var actions: () -> Actions

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
                Text("@\(person.handle)")
                    .font(.subheadline)
                    .foregroundStyle(person.name.map { !$0.isEmpty } == true ? .secondary : .primary)
            }
            Spacer()
            actions()
        }
        .contentShape(Rectangle())
        .accessibilityIdentifier("ios.social.person.\(person.userId)")
    }
}
