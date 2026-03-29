const { withXcodeProject } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Expo config plugin that transforms the expo-widgets generated
 * BookshelfWidget from a StaticConfiguration into an AppIntentConfiguration.
 *
 * It overwrites the generated BookshelfWidget.swift with a version that
 * includes AppEntity, EntityQuery, WidgetConfigurationIntent, and an
 * AppIntentTimelineProvider — all in a single file so users can pick a shelf
 * without needing to manipulate Xcode build phases for extra source files.
 */

const TARGET_NAME = "ExpoWidgetsTarget";

// ---------------------------------------------------------------------------
// BookshelfAppIntent.swift is no longer written as a separate file.
// All AppIntent types are now inlined into BookshelfWidget.swift above to
// avoid fragile Xcode build-phase manipulation for extra source files.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Swift source for the configurable widget (replaces the generated static one)
// All types are in a single file to avoid Xcode build-phase issues with adding
// extra Swift files to the widget target programmatically.
// ---------------------------------------------------------------------------
const bookshelfWidgetSwift = (displayName, description, families, groupIdentifier) => `import WidgetKit
import SwiftUI
import AppIntents

// MARK: - Shared UserDefaults helper (replaces internal ExpoWidgets WidgetsStorage)

private enum WidgetDataStore {
  static let suiteName = "${groupIdentifier}"
  static let timelineKey = "__expo_widgets_BookshelfWidget_timeline"

  static func getTimeline() -> [[String: Any]] {
    guard let defaults = UserDefaults(suiteName: suiteName),
          let arr = defaults.array(forKey: timelineKey) as? [[String: Any]] else {
      return []
    }
    return arr
  }
}

// MARK: - Timeline entry (replaces internal ExpoWidgets WidgetsTimelineEntry)

struct BookshelfEntry: TimelineEntry {
  let date: Date
  let isPremium: Bool
  let bookshelfName: String?
  let bookshelfId: String?
  let books: [[String: Any]]
}

// MARK: - Native SwiftUI widget view

struct BookshelfWidgetView: View {
  let entry: BookshelfEntry
  @Environment(\\.widgetFamily) var family

  var body: some View {
    Group {
      if !entry.isPremium {
        VStack {
          Text("Subscribe to display your shelf")
            .font(.system(size: 14, weight: .semibold))
            .foregroundColor(Color(red: 142/255, green: 142/255, blue: 147/255))
        }
        .padding(12)
      } else if entry.bookshelfName == nil || entry.bookshelfId == nil {
        VStack {
          Text("Long-press to choose a shelf")
            .font(.system(size: 13))
            .foregroundColor(Color(red: 142/255, green: 142/255, blue: 147/255))
        }
        .padding(12)
      } else {
        bookshelfContent
      }
    }
  }

  private var maxBooks: Int {
    family == .systemMedium ? 7 : 14
  }

  private var spineWidth: CGFloat { 36 }
  private var spineHeight: CGFloat { 54 }

  @ViewBuilder
  private var bookshelfContent: some View {
    let visible = Array(entry.books.prefix(maxBooks))
    let booksPerRow = 7
    let topRow = Array(visible.prefix(booksPerRow))
    let bottomRow = family == .systemLarge ? Array(visible.dropFirst(booksPerRow).prefix(booksPerRow)) : []

    VStack(alignment: .leading, spacing: 8) {
      Text(entry.bookshelfName ?? "")
        .font(.system(size: 14, weight: .bold))
        .lineLimit(1)

      spineRow(topRow)

      if !bottomRow.isEmpty {
        spineRow(bottomRow)
      }
    }
    .padding(12)
  }

  private func spineRow(_ books: [[String: Any]]) -> some View {
    HStack(spacing: 4) {
      ForEach(Array(books.enumerated()), id: \\.offset) { _, book in
        let title = book["title"] as? String ?? ""
        RoundedRectangle(cornerRadius: 3)
          .fill(stableColor(for: title))
          .frame(width: spineWidth, height: spineHeight)
          .overlay(
            Text(String(title.prefix(1)))
              .font(.system(size: round(spineWidth * 0.4), weight: .bold))
              .foregroundColor(.white)
          )
      }
    }
  }

  private func stableColor(for title: String) -> Color {
    var hash = 0
    for ch in title.unicodeScalars { hash += Int(ch.value) }
    let hue = Double(hash % 360) / 360.0
    return Color(hue: hue, saturation: 0.5, brightness: 0.55)
  }
}

// MARK: - Bookshelf entity for the widget picker

@available(iOS 17.0, *)
struct BookshelfEntity: AppEntity {
  static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Bookshelf")
  static var defaultQuery = BookshelfEntityQuery()

  var id: String
  var name: String

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\\(name)")
  }
}

// MARK: - Query that reads bookshelves from shared UserDefaults

@available(iOS 17.0, *)
struct BookshelfEntityQuery: EntityQuery {
  func entities(for identifiers: [String]) async throws -> [BookshelfEntity] {
    return loadShelves().filter { identifiers.contains($0.id) }
  }

  func suggestedEntities() async throws -> [BookshelfEntity] {
    return loadShelves()
  }

  func defaultResult() async -> BookshelfEntity? {
    return loadShelves().first
  }

  private func loadShelves() -> [BookshelfEntity] {
    let timeline = WidgetDataStore.getTimeline()
    guard let firstEntry = timeline.first,
          let props = firstEntry["props"] as? [String: Any],
          let shelves = props["bookshelves"] as? [[String: Any]] else {
      return []
    }

    return shelves.compactMap { dict in
      guard let id = dict["id"] as? String,
            let name = dict["name"] as? String else { return nil }
      return BookshelfEntity(id: id, name: name)
    }
  }
}

// MARK: - Configuration intent shown when the user edits the widget

@available(iOS 17.0, *)
struct SelectBookshelfIntent: WidgetConfigurationIntent {
  static var title: LocalizedStringResource = "Select Bookshelf"
  static var description: IntentDescription = "Choose which bookshelf to display on your home screen."

  @Parameter(title: "Bookshelf")
  var bookshelf: BookshelfEntity?
}

// MARK: - Helper to build a BookshelfEntry from stored data

private func buildBookshelfEntry(selectedId: String?) -> BookshelfEntry {
  let timeline = WidgetDataStore.getTimeline()
  guard let firstEntry = timeline.first,
        let allProps = firstEntry["props"] as? [String: Any] else {
    return BookshelfEntry(date: Date(), isPremium: false, bookshelfName: nil, bookshelfId: nil, books: [])
  }

  let isPremium = allProps["isPremium"] as? Bool ?? false

  guard let bookshelves = allProps["bookshelves"] as? [[String: Any]] else {
    return BookshelfEntry(date: Date(), isPremium: isPremium, bookshelfName: nil, bookshelfId: nil, books: [])
  }

  let shelf = bookshelves.first { ($0["id"] as? String) == selectedId } ?? bookshelves.first

  guard let shelf else {
    return BookshelfEntry(date: Date(), isPremium: isPremium, bookshelfName: nil, bookshelfId: nil, books: [])
  }

  return BookshelfEntry(
    date: Date(),
    isPremium: isPremium,
    bookshelfName: shelf["name"] as? String,
    bookshelfId: shelf["id"] as? String,
    books: shelf["books"] as? [[String: Any]] ?? []
  )
}

// MARK: - Configurable timeline provider (iOS 17+)

@available(iOS 17.0, *)
struct BookshelfConfigurableProvider: AppIntentTimelineProvider {
  typealias Entry = BookshelfEntry
  typealias Intent = SelectBookshelfIntent

  func placeholder(in context: Context) -> BookshelfEntry {
    BookshelfEntry(date: Date(), isPremium: false, bookshelfName: nil, bookshelfId: nil, books: [])
  }

  func snapshot(for configuration: SelectBookshelfIntent, in context: Context) async -> BookshelfEntry {
    return buildBookshelfEntry(selectedId: configuration.bookshelf?.id)
  }

  func timeline(for configuration: SelectBookshelfIntent, in context: Context) async -> Timeline<BookshelfEntry> {
    let entry = buildBookshelfEntry(selectedId: configuration.bookshelf?.id)
    return Timeline(entries: [entry], policy: .atEnd)
  }
}

// MARK: - Static timeline provider (pre-iOS 17 fallback)

struct BookshelfStaticProvider: TimelineProvider {
  typealias Entry = BookshelfEntry

  func placeholder(in context: Context) -> BookshelfEntry {
    BookshelfEntry(date: Date(), isPremium: false, bookshelfName: nil, bookshelfId: nil, books: [])
  }

  func getSnapshot(in context: Context, completion: @escaping (BookshelfEntry) -> Void) {
    completion(buildBookshelfEntry(selectedId: nil))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<BookshelfEntry>) -> Void) {
    let entry = buildBookshelfEntry(selectedId: nil)
    completion(Timeline(entries: [entry], policy: .atEnd))
  }
}

// MARK: - Widget definition using AppIntentConfiguration

struct BookshelfWidget: Widget {
  let kind: String = "BookshelfWidget"

  var body: some WidgetConfiguration {
    if #available(iOS 17.0, *) {
      return AppIntentConfiguration(
        kind: kind,
        intent: SelectBookshelfIntent.self,
        provider: BookshelfConfigurableProvider()
      ) { entry in
        BookshelfWidgetView(entry: entry)
      }
      .configurationDisplayName("${displayName}")
      .description("${description}")
      .supportedFamilies([.${families}])
    } else {
      return StaticConfiguration(
        kind: kind,
        provider: BookshelfStaticProvider()
      ) { entry in
        BookshelfWidgetView(entry: entry)
      }
      .configurationDisplayName("${displayName}")
      .description("${description}")
      .supportedFamilies([.${families}])
    }
  }
}
`;

// ---------------------------------------------------------------------------
// Helper: read widget display metadata from app.json expo-widgets plugin
// ---------------------------------------------------------------------------
function readWidgetMeta(config) {
  const expoWidgetsPlugin = (config.plugins || []).find(
    (p) => Array.isArray(p) && p[0] === "expo-widgets"
  );
  const pluginOpts = expoWidgetsPlugin?.[1] || {};
  const widgetDef =
    pluginOpts.widgets?.find((w) => w.name === "BookshelfWidget") || {};
  const displayName = widgetDef.displayName || "My Bookshelf";
  const description =
    widgetDef.description || "Show one shelf from your library.";
  const families = (widgetDef.supportedFamilies || [
    "systemMedium",
    "systemLarge",
  ]).join(", .");
  const groupIdentifier =
    pluginOpts.groupIdentifier || "group.com.yourcompany.virtuallibrary";
  return { displayName, description, families, groupIdentifier };
}

// ---------------------------------------------------------------------------
// Plugin: overwrite the expo-widgets generated BookshelfWidget.swift
// ---------------------------------------------------------------------------
const withConfigurableWidgetXcode = (config) => {
  return withXcodeProject(config, (config) => {
    const projectRoot = config.modRequest.platformProjectRoot;
    const targetDir = path.join(projectRoot, TARGET_NAME);

    // ---------------------------------------------------------------
    // Write (or overwrite) BookshelfWidget.swift.
    // This MUST happen inside withXcodeProject so it runs AFTER
    // expo-widgets has generated its default BookshelfWidget.swift
    // (which uses StaticConfiguration).
    // All AppIntent types are inlined into this single file so we
    // don't need to add extra files to the Xcode build sources.
    // ---------------------------------------------------------------
    const { displayName, description, families, groupIdentifier } =
      readWidgetMeta(config);

    fs.mkdirSync(targetDir, { recursive: true });

    const widgetSwiftPath = path.join(targetDir, "BookshelfWidget.swift");
    fs.writeFileSync(
      widgetSwiftPath,
      bookshelfWidgetSwift(displayName, description, families, groupIdentifier)
    );

    // Clean up the old separate intent file if it exists from a previous build
    const oldIntentPath = path.join(targetDir, "BookshelfAppIntent.swift");
    if (fs.existsSync(oldIntentPath)) {
      fs.unlinkSync(oldIntentPath);
    }

    return config;
  });
};

// ---------------------------------------------------------------------------
// Combined plugin
// ---------------------------------------------------------------------------
const withConfigurableWidget = (config) => {
  // All work (file writes + Xcode project changes) now happens in a single
  // withXcodeProject handler so that we always run AFTER expo-widgets has
  // generated its default StaticConfiguration widget.
  config = withConfigurableWidgetXcode(config);
  return config;
};

module.exports = withConfigurableWidget;
