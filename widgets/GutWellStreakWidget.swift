import SwiftUI
import WidgetKit

// MARK: - Shared Data

struct WidgetData {
    let streak: Int
    let gutScore: Int
    let lastCheckIn: String

    static func load() -> WidgetData {
        let defaults = UserDefaults(suiteName: "group.com.parallellabs.gutwell")
        let streak = defaults?.integer(forKey: "streak") ?? 0
        let gutScore = defaults?.integer(forKey: "gutScore") ?? 0
        let lastCheckIn = defaults?.string(forKey: "lastCheckIn") ?? "No check-in yet"
        return WidgetData(streak: streak, gutScore: gutScore, lastCheckIn: lastCheckIn)
    }
}

// MARK: - Timeline Provider

struct GutWellProvider: TimelineProvider {
    func placeholder(in context: Context) -> GutWellEntry {
        GutWellEntry(date: Date(), streak: 7, gutScore: 72, lastCheckIn: "Today")
    }

    func getSnapshot(in context: Context, completion: @escaping (GutWellEntry) -> Void) {
        let data = WidgetData.load()
        let entry = GutWellEntry(date: Date(), streak: data.streak, gutScore: data.gutScore, lastCheckIn: data.lastCheckIn)
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<GutWellEntry>) -> Void) {
        let data = WidgetData.load()
        let entry = GutWellEntry(date: Date(), streak: data.streak, gutScore: data.gutScore, lastCheckIn: data.lastCheckIn)
        // Refresh every 30 minutes
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }
}

// MARK: - Timeline Entry

struct GutWellEntry: TimelineEntry {
    let date: Date
    let streak: Int
    let gutScore: Int
    let lastCheckIn: String
}

// MARK: - Widget Views

struct GutWellSmallView: View {
    let entry: GutWellEntry

    var scoreColor: Color {
        if entry.gutScore >= 70 { return Color(red: 0.32, green: 0.72, blue: 0.53) }
        if entry.gutScore >= 40 { return Color(red: 0.95, green: 0.77, blue: 0.06) }
        return Color(red: 0.90, green: 0.30, blue: 0.24)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header
            HStack(spacing: 4) {
                Image(systemName: "leaf.fill")
                    .font(.system(size: 12))
                    .foregroundColor(Color(red: 0.32, green: 0.72, blue: 0.53))
                Text("NutriFlow")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.secondary)
            }

            Spacer()

            // Gut Score
            VStack(alignment: .leading, spacing: 2) {
                Text("\(entry.gutScore)")
                    .font(.system(size: 36, weight: .bold, design: .rounded))
                    .foregroundColor(scoreColor)
                Text("Gut Score")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }

            // Streak
            HStack(spacing: 4) {
                Image(systemName: "flame.fill")
                    .font(.system(size: 11))
                    .foregroundColor(.orange)
                Text("\(entry.streak) day streak")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.primary)
            }
        }
        .padding()
        .containerBackground(for: .widget) {
            Color(UIColor.systemBackground)
        }
    }
}

struct GutWellMediumView: View {
    let entry: GutWellEntry

    var scoreColor: Color {
        if entry.gutScore >= 70 { return Color(red: 0.32, green: 0.72, blue: 0.53) }
        if entry.gutScore >= 40 { return Color(red: 0.95, green: 0.77, blue: 0.06) }
        return Color(red: 0.90, green: 0.30, blue: 0.24)
    }

    var body: some View {
        HStack(spacing: 16) {
            // Left: Score circle
            VStack(spacing: 4) {
                ZStack {
                    Circle()
                        .stroke(Color.gray.opacity(0.2), lineWidth: 6)
                        .frame(width: 64, height: 64)
                    Circle()
                        .trim(from: 0, to: CGFloat(entry.gutScore) / 100)
                        .stroke(scoreColor, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                        .frame(width: 64, height: 64)
                        .rotationEffect(.degrees(-90))
                    Text("\(entry.gutScore)")
                        .font(.system(size: 22, weight: .bold, design: .rounded))
                        .foregroundColor(scoreColor)
                }
                Text("Gut Score")
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
            }

            // Right: Stats
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 4) {
                    Image(systemName: "leaf.fill")
                        .font(.system(size: 12))
                        .foregroundColor(Color(red: 0.32, green: 0.72, blue: 0.53))
                    Text("NutriFlow")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.secondary)
                }

                HStack(spacing: 4) {
                    Image(systemName: "flame.fill")
                        .font(.system(size: 13))
                        .foregroundColor(.orange)
                    Text("\(entry.streak) day streak")
                        .font(.system(size: 14, weight: .semibold))
                }

                HStack(spacing: 4) {
                    Image(systemName: "clock")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                    Text(entry.lastCheckIn)
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }

                Spacer()
            }

            Spacer()
        }
        .padding()
        .containerBackground(for: .widget) {
            Color(UIColor.systemBackground)
        }
    }
}

// MARK: - Widget Definition

struct GutWellStreakWidget: Widget {
    let kind = "GutWellStreakWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GutWellProvider()) { entry in
            if #available(iOS 17.0, *) {
                GutWellWidgetEntryView(entry: entry)
            } else {
                GutWellWidgetEntryView(entry: entry)
            }
        }
        .configurationDisplayName("NutriFlow")
        .description("Track your gut score and check-in streak.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct GutWellWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: GutWellEntry

    var body: some View {
        switch family {
        case .systemMedium:
            GutWellMediumView(entry: entry)
        default:
            GutWellSmallView(entry: entry)
        }
    }
}
