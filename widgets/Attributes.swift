import Foundation

// Required by `react-native-widget-extension` (its plugin copies this file
// into both the native module pod and the widget-extension target, so it must
// compile in both with no extra dependencies).
//
// GutWell uses a *static* WidgetKit widget fed via the App Group
// `group.com.parallellabs.gutwell` (see GutWellStreakWidget.swift / lib/widget-data.ts),
// not Live Activities, so no ActivityAttributes type is needed today. This file
// is intentionally minimal. To add a Live Activity later, declare e.g.:
//
//   import ActivityKit
//   @available(iOS 16.1, *)
//   struct GutWellWidgetAttributes: ActivityAttributes {
//     public struct ContentState: Codable, Hashable { var streak: Int; var gutScore: Int }
//     var name: String
//   }
//
// and implement the start/update/end functions in Module.swift against it.
