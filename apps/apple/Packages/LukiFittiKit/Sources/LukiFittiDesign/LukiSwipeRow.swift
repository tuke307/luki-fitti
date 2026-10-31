import SwiftUI
import LukiFittiModels
#if os(iOS)
import UIKit
#endif

public struct LukiSwipeAction: Identifiable {
    public enum Tone { case neutral, accent, destructive }

    public let id: String
    public let label: String
    public let systemImage: String
    public let tone: Tone
    public let action: () -> Void

    public init(id: String, label: String, systemImage: String, tone: Tone = .neutral, action: @escaping () -> Void) {
        self.id = id
        self.label = label
        self.systemImage = systemImage
        self.tone = tone
        self.action = action
    }

    var background: Color {
        switch tone {
        case .neutral: return LukiColors.neutralAction
        case .accent: return LukiColors.accent
        case .destructive: return LukiColors.destructive
        }
    }

    var foreground: Color {
        switch tone {
        case .neutral: return .white
        case .accent: return LukiColors.accentForeground
        case .destructive: return LukiColors.onTint
        }
    }
}

/// Swipe-to-reveal actions for rows inside a `ScrollView` (SwiftUI's `.swipeActions` only works in
/// `List`). Swipe right reveals `leading`, swipe left reveals `trailing`, mirroring the web SwipeRow.
public struct LukiSwipeRow<Content: View>: View {
    private let leading: [LukiSwipeAction]
    private let trailing: [LukiSwipeAction]
    private let cornerRadius: CGFloat
    private let content: Content

    @State private var offset: CGFloat = 0
    @State private var dragBase: CGFloat = 0
    #if !os(iOS)
    @State private var isHorizontalDrag: Bool?
    #endif

    private let actionWidth: CGFloat = 76

    public init(
        leading: [LukiSwipeAction] = [],
        trailing: [LukiSwipeAction] = [],
        cornerRadius: CGFloat = 22,
        @ViewBuilder content: () -> Content
    ) {
        self.leading = leading
        self.trailing = trailing
        self.cornerRadius = cornerRadius
        self.content = content()
    }

    private var leadingWidth: CGFloat { CGFloat(leading.count) * actionWidth }
    private var trailingWidth: CGFloat { CGFloat(trailing.count) * actionWidth }

    public var body: some View {
        ZStack {
            HStack(spacing: 0) {
                if offset > 0 { actionButtons(leading) }
                Spacer(minLength: 0)
                if offset < 0 { actionButtons(trailing) }
            }

            content
                .offset(x: offset)
                .overlay {
                    // Only while open: a tap anywhere on the row closes it. No tap gesture while
                    // closed, so it never competes with the scroll view or the row's buttons.
                    if offset != 0 {
                        Color.clear
                            .contentShape(Rectangle())
                            .offset(x: offset)
                            .onTapGesture { close() }
                    }
                }
                #if os(iOS)
                .gesture(HorizontalPanGesture(onBegan: beginDrag, onChanged: updateDrag, onEnded: endDrag))
                #else
                .simultaneousGesture(drag)
                #endif
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .accessibilityActions {
            ForEach(leading + trailing) { action in
                Button(action.label) { action.action() }
            }
        }
    }

    private func actionButtons(_ actions: [LukiSwipeAction]) -> some View {
        HStack(spacing: 0) {
            ForEach(actions) { action in
                Button {
                    close()
                    action.action()
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: action.systemImage)
                            .font(.body.weight(.semibold))
                        Text(action.label)
                            .font(.caption.weight(.medium))
                            .lineLimit(2)
                            .multilineTextAlignment(.center)
                    }
                    .foregroundStyle(action.foreground)
                    .frame(width: actionWidth)
                    .frame(maxHeight: .infinity)
                    .background(action.background)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func beginDrag() {
        dragBase = offset
    }

    private func updateDrag(_ translation: CGFloat) {
        let next = dragBase + translation
        let maxOffset = leadingWidth
        let minOffset = -trailingWidth
        offset = next > maxOffset
            ? maxOffset + (next - maxOffset) * 0.2
            : next < minOffset ? minOffset + (next - minOffset) * 0.2 : next
    }

    private func endDrag(_ translation: CGFloat) {
        let target = dragBase + translation
        withAnimation(.snappy(duration: 0.25)) {
            if target > leadingWidth / 2, leadingWidth > 0 {
                offset = leadingWidth
            } else if target < -trailingWidth / 2, trailingWidth > 0 {
                offset = -trailingWidth
            } else {
                offset = 0
            }
        }
    }

    #if !os(iOS)
    private var drag: some Gesture {
        DragGesture(minimumDistance: 12)
            .onChanged { value in
                if isHorizontalDrag == nil {
                    isHorizontalDrag = abs(value.translation.width) > abs(value.translation.height)
                    beginDrag()
                }
                guard isHorizontalDrag == true else { return }
                updateDrag(value.translation.width)
            }
            .onEnded { value in
                defer { isHorizontalDrag = nil }
                guard isHorizontalDrag == true else { return }
                endDrag(value.translation.width)
            }
    }
    #endif

    private func close() {
        withAnimation(.snappy(duration: 0.25)) { offset = 0 }
    }
}

#if os(iOS)
/// UIKit pan that only begins for clearly horizontal swipes, so vertical drags go straight to the
/// enclosing `ScrollView` instead of stalling while a SwiftUI `DragGesture` decides its direction.
private struct HorizontalPanGesture: UIGestureRecognizerRepresentable {
    let onBegan: () -> Void
    let onChanged: (CGFloat) -> Void
    let onEnded: (CGFloat) -> Void

    func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
        let pan = UIPanGestureRecognizer()
        pan.delegate = context.coordinator
        return pan
    }

    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator {
        Coordinator()
    }

    func handleUIGestureRecognizerAction(_ recognizer: UIPanGestureRecognizer, context: Context) {
        let translation = recognizer.translation(in: recognizer.view).x
        switch recognizer.state {
        case .began: onBegan()
        case .changed: onChanged(translation)
        case .ended, .cancelled, .failed: onEnded(translation)
        default: break
        }
    }

    @MainActor
    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            guard let pan = gestureRecognizer as? UIPanGestureRecognizer else { return false }
            let velocity = pan.velocity(in: pan.view)
            return abs(velocity.x) > abs(velocity.y) * 1.5
        }
    }
}
#endif

/// Set badge that keeps its type colour and label after the set is logged (mirrors the web badge).
public struct SetTypeBadge: View {
    let setType: SetType
    let label: String
    let completed: Bool
    @ScaledMetric(relativeTo: .callout) private var size: CGFloat = 32

    public init(setType: SetType, label: String, completed: Bool) {
        self.setType = setType
        self.label = label
        self.completed = completed
    }

    public var body: some View {
        let typeColor = LukiColors.setTypeColor(setType)
        let fill: Color = completed ? (typeColor ?? LukiColors.success) : (typeColor?.opacity(0.18) ?? LukiColors.fill)
        let foreground: Color = completed ? LukiColors.onTint : (typeColor ?? .primary)
        Text(label)
            .font(.callout.bold().monospacedDigit())
            .foregroundStyle(foreground)
            .frame(width: size, height: size)
            .background(Circle().fill(fill))
            .overlay(alignment: .bottomTrailing) {
                if completed {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.caption.bold())
                        .foregroundStyle(LukiColors.success, LukiColors.cardBackground)
                        .background(Circle().fill(LukiColors.cardBackground))
                        .offset(x: 3, y: 3)
                }
            }
            .accessibilityLabel(label)
    }
}
