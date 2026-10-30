import SwiftUI
import UIKit
import LukiFittiModels
import LukiFittiDesign
import LukiFittiAPI
import LukiFittiStore

/// A meal photo that is either saved on the server or picked locally and not uploaded yet.
enum MealPhotoItem: Identifiable {
    case saved(MealPhotoDto)
    case local(id: String, image: UIImage)

    var id: String {
        switch self {
        case .saved(let photo): photo.id
        case .local(let id, _): id
        }
    }

    var savedPhoto: MealPhotoDto? {
        if case .saved(let photo) = self { return photo }
        return nil
    }
}

/// Loads a photo through the authenticated cache; shows a placeholder, "no longer available"
/// (404 after the retention sweep) or an offline note.
struct MealPhotoImage: View {
    let item: MealPhotoItem
    let api: APIClient
    var contentMode: ContentMode = .fill
    var compact = true
    var onLoaded: ((UIImage) -> Void)?

    @Environment(\.lukiLocale) private var tr
    @State private var phase: Phase = .loading

    enum Phase { case loading, loaded(UIImage), unavailable, offline, failed }

    var body: some View {
        Group {
            switch phase {
            case .loading:
                MealPhotoPlaceholder()
            case .loaded(let image):
                Image(uiImage: image).resizable().aspectRatio(contentMode: contentMode)
            case .unavailable, .offline, .failed:
                ZStack {
                    Rectangle().fill(LukiColors.fill)
                    VStack(spacing: 6) {
                        Image(systemName: isOffline ? "wifi.slash" : "photo.badge.exclamationmark")
                            .font(compact ? .footnote : .title2)
                        if !compact {
                            Text(message).font(.subheadline).multilineTextAlignment(.center)
                        }
                    }
                    .foregroundStyle(.secondary)
                    .padding(8)
                }
                .accessibilityLabel(message)
            }
        }
        .task(id: item.id) { await load() }
    }

    private var isOffline: Bool { if case .offline = phase { return true } else { return false } }

    private var message: String {
        switch phase {
        case .offline: tr("Photos load when you’re online.")
        case .failed: tr("Photo couldn’t be loaded.")
        default: tr("Photo no longer available")
        }
    }

    private func load() async {
        switch item {
        case .local(_, let image):
            phase = .loaded(image)
            onLoaded?(image)
        case .saved(let photo):
            if case .loaded = phase { return }
            do {
                let data = try await MealPhotoCache.shared.load(photo, api: api)
                guard let image = UIImage(data: data) else { phase = .failed; return }
                phase = .loaded(image)
                onLoaded?(image)
            } catch .unavailable {
                phase = .unavailable
            } catch .offline {
                phase = .offline
            } catch {
                phase = .failed
            }
        }
    }
}

/// Redacted-style shimmer while a photo loads (static with Reduce Motion).
struct MealPhotoPlaceholder: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.lukiLocale) private var tr
    @State private var dim = false

    var body: some View {
        Rectangle()
            .fill(LukiColors.fill)
            .opacity(dim ? 0.45 : 1)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { dim = true }
            }
            .accessibilityLabel(tr("Loading photo"))
    }
}

/// Full-screen photo viewer: pinch/double-tap zoom, paging, swipe down to close, share and delete.
struct MealPhotoViewer: View {
    let items: [MealPhotoItem]
    let mealLabel: String
    let timeLabel: String
    let api: APIClient
    /// Deletes a saved photo; `nil` hides Delete (e.g. offline).
    let onDelete: ((MealPhotoDto) async -> Bool)?

    @Environment(\.dismiss) private var dismiss
    @Environment(\.lukiLocale) private var tr
    @State private var selection: String
    @State private var images: [String: UIImage] = [:]
    @State private var zoomed = false
    @State private var dragOffset: CGFloat = 0
    @State private var confirmDelete = false

    init(
        items: [MealPhotoItem],
        startAt id: String,
        mealLabel: String,
        timeLabel: String,
        api: APIClient,
        onDelete: ((MealPhotoDto) async -> Bool)?
    ) {
        self.items = items
        self.mealLabel = mealLabel
        self.timeLabel = timeLabel
        self.api = api
        self.onDelete = onDelete
        _selection = State(initialValue: id)
    }

    private var current: MealPhotoItem? { items.first { $0.id == selection } ?? items.first }
    private var position: Int { (items.firstIndex { $0.id == current?.id } ?? 0) + 1 }

    var body: some View {
        NavigationStack {
            TabView(selection: $selection) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    ZoomableMealPhoto(item: item, api: api, zoomed: $zoomed) { images[item.id] = $0 }
                        .tag(item.id)
                        .accessibilityLabel(tr("Photo %d of %d, %@, %@", index + 1, items.count, mealLabel, timeLabel))
                }
            }
            .tabViewStyle(.page(indexDisplayMode: items.count > 1 ? .automatic : .never))
            .offset(y: dragOffset)
            .opacity(1 - min(0.5, Double(dragOffset / 600)))
            .gesture(dismissDrag, including: zoomed ? .subviews : .all)
            .background(Color.black.ignoresSafeArea())
            .toolbarBackground(.hidden, for: .navigationBar)
            .navigationTitle(items.count > 1 ? tr("%d of %d", position, items.count) : "")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .accessibilityLabel(tr("Close"))
                        .accessibilityIdentifier("ios.nutrition.photoViewer.close")
                }
                ToolbarItem(placement: .primaryAction) { menu }
            }
            .confirmationDialog(tr("Delete this photo?"), isPresented: $confirmDelete, titleVisibility: .visible) {
                Button(tr("Delete photo"), role: .destructive) { Task { await deleteCurrent() } }
            } message: {
                Text(tr("This photo will be removed from the meal."))
            }
            .onChange(of: items.map(\.id)) { _, ids in
                if ids.isEmpty { dismiss() } else if !ids.contains(selection), let first = ids.first { selection = first }
            }
        }
    }

    @ViewBuilder
    private var menu: some View {
        let image = current.flatMap { images[$0.id] }
        let canDelete = current?.savedPhoto != nil && onDelete != nil
        if image != nil || canDelete {
            Menu {
                if let image {
                    ShareLink(
                        item: Image(uiImage: image),
                        preview: SharePreview(mealLabel, image: Image(uiImage: image))
                    ) {
                        Label(tr("Share"), systemImage: "square.and.arrow.up")
                    }
                }
                if canDelete {
                    Button(role: .destructive) { confirmDelete = true } label: {
                        Label(tr("Delete photo"), systemImage: "trash")
                    }
                }
            } label: {
                Image(systemName: "ellipsis.circle")
            }
            .accessibilityLabel(tr("More"))
            .accessibilityIdentifier("ios.nutrition.photoViewer.menu")
        }
    }

    private var dismissDrag: some Gesture {
        DragGesture(minimumDistance: 20)
            .onChanged { value in
                guard abs(value.translation.height) > abs(value.translation.width) else { return }
                dragOffset = max(0, value.translation.height)
            }
            .onEnded { value in
                if value.translation.height > 120 { dismiss() } else { withAnimation(.snappy) { dragOffset = 0 } }
            }
    }

    private func deleteCurrent() async {
        guard let photo = current?.savedPhoto, let onDelete else { return }
        let ids = items.map(\.id)
        let index = ids.firstIndex(of: photo.id) ?? 0
        if await onDelete(photo) {
            let remaining = ids.filter { $0 != photo.id }
            if remaining.isEmpty { dismiss() } else { selection = remaining[min(index, remaining.count - 1)] }
        }
    }
}

private struct ZoomableMealPhoto: View {
    let item: MealPhotoItem
    let api: APIClient
    @Binding var zoomed: Bool
    let onLoaded: (UIImage) -> Void

    @State private var scale: CGFloat = 1
    @State private var lastScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero

    var body: some View {
        MealPhotoImage(item: item, api: api, contentMode: .fit, compact: false, onLoaded: onLoaded)
            .scaleEffect(scale)
            .offset(offset)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
            .gesture(
                MagnifyGesture()
                    .onChanged { value in scale = min(4, max(1, lastScale * value.magnification)) }
                    .onEnded { _ in
                        lastScale = scale
                        if scale <= 1 { reset() }
                        zoomed = scale > 1
                    }
            )
            .simultaneousGesture(
                DragGesture()
                    .onChanged { value in
                        guard scale > 1 else { return }
                        offset = CGSize(
                            width: lastOffset.width + value.translation.width,
                            height: lastOffset.height + value.translation.height
                        )
                    }
                    .onEnded { _ in lastOffset = offset },
                including: scale > 1 ? .all : .none
            )
            .onTapGesture(count: 2) {
                withAnimation(.snappy) {
                    if scale > 1 { reset() } else { scale = 2.5; lastScale = 2.5 }
                    zoomed = scale > 1
                }
            }
            .accessibilityAddTraits(.isImage)
            .onDisappear {
                reset()
                zoomed = false
            }
    }

    private func reset() {
        scale = 1
        lastScale = 1
        offset = .zero
        lastOffset = .zero
    }
}
