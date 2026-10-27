import SwiftUI
import LukiFittiModels

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
        case .neutral: return Color.gray
        case .accent: return LukiColors.accent
        case .destructive: return LukiColors.destructive
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
    @State private var isHorizontalDrag: Bool?

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
                .simultaneousGesture(drag)
                .onTapGesture {
                    if offset != 0 { close() }
                }
                .allowsHitTesting(true)
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
                            .font(.system(size: 17, weight: .semibold))
                        Text(action.label)
                            .font(.caption.weight(.medium))
                            .lineLimit(2)
                            .multilineTextAlignment(.center)
                    }
                    .foregroundStyle(.white)
                    .frame(width: actionWidth)
                    .frame(maxHeight: .infinity)
                    .background(action.background)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var drag: some Gesture {
        DragGesture(minimumDistance: 12)
            .onChanged { value in
                if isHorizontalDrag == nil {
                    isHorizontalDrag = abs(value.translation.width) > abs(value.translation.height)
                    dragBase = offset
                }
                guard isHorizontalDrag == true else { return }
                let next = dragBase + value.translation.width
                let maxOffset = leadingWidth
                let minOffset = -trailingWidth
                offset = next > maxOffset
                    ? maxOffset + (next - maxOffset) * 0.2
                    : next < minOffset ? minOffset + (next - minOffset) * 0.2 : next
            }
            .onEnded { value in
                defer { isHorizontalDrag = nil }
                guard isHorizontalDrag == true else { return }
                let target = dragBase + value.translation.width
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
    }

    private func close() {
        withAnimation(.snappy(duration: 0.25)) { offset = 0 }
    }
}

/// Set badge that keeps its type colour and label after the set is logged (mirrors the web badge).
public struct SetTypeBadge: View {
    let setType: SetType
    let label: String
    let completed: Bool

    public init(setType: SetType, label: String, completed: Bool) {
        self.setType = setType
        self.label = label
        self.completed = completed
    }

    public var body: some View {
        let typeColor = LukiColors.setTypeColor(setType)
        let fill: Color = completed ? (typeColor ?? LukiColors.success) : (typeColor?.opacity(0.18) ?? LukiColors.fill)
        let foreground: Color = completed ? .white : (typeColor ?? .primary)
        Text(label)
            .font(.callout.bold().monospacedDigit())
            .foregroundStyle(foreground)
            .frame(width: 32, height: 32)
            .background(Circle().fill(fill))
            .overlay(alignment: .bottomTrailing) {
                if completed {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(LukiColors.success, LukiColors.cardBackground)
                        .background(Circle().fill(LukiColors.cardBackground))
                        .offset(x: 3, y: 3)
                }
            }
            .accessibilityLabel(label)
    }
}
