import ExpoModulesCore

#if canImport(ActivityKit)
import ActivityKit
#endif

// Native module bridged to JS by `react-native-widget-extension`.
//
// NOTE: GutWell ships a *static* WidgetKit home-screen widget
// (see GutWellStreakWidget.swift) and does NOT use Live Activities.
// The package nonetheless requires a `Module.swift` defining the
// `ReactNativeWidgetExtension` native module — its Swift sources are what
// the pod compiles, so without this file `import ReactNativeWidgetExtension`
// fails to resolve during the build. The Live Activity functions below are
// safe no-ops kept only to satisfy the JS API surface; nothing in the app
// calls them. To add real Live Activities later, define an ActivityAttributes
// type in Attributes.swift and implement these functions against it.
public class ReactNativeWidgetExtensionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReactNativeWidgetExtension")

    Function("areActivitiesEnabled") { () -> Bool in
      #if canImport(ActivityKit)
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      #endif
      return false
    }

    Function("startActivity") { (id: String, title: String, body: String) -> String in
      // No-op: GutWell does not use Live Activities.
      return ""
    }

    Function("updateActivity") { (id: String, title: String, body: String) -> Void in
      // No-op.
    }

    Function("endActivity") { (id: String) -> Void in
      // No-op.
    }
  }
}
