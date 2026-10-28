import SwiftUI
import WidgetKit

@main
public struct LukiFittiWidgetBundle: WidgetBundle {
    public init() {}

    public var body: some Widget {
        #if canImport(ActivityKit)
        RestTimerLiveActivity()
        #endif
    }
}
