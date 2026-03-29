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
const bookshelfWidgetSwift = (displayName, description, families) => `import WidgetKit
import SwiftUI
import AppIntents
internal import ExpoWidgets

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
    let timeline = WidgetsStorage.getArray(forKey: "__expo_widgets_BookshelfWidget_timeline") ?? []
    guard let firstEntry = timeline.first as? [String: Any],
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

// MARK: - Configurable timeline provider

@available(iOS 17.0, *)
struct BookshelfConfigurableProvider: AppIntentTimelineProvider {
  typealias Entry = WidgetsTimelineEntry
  typealias Intent = SelectBookshelfIntent

  let name: String = "BookshelfWidget"

  func placeholder(in context: Context) -> WidgetsTimelineEntry {
    WidgetsTimelineEntry(date: Date(), name: name, props: nil, entryIndex: nil)
  }

  func snapshot(for configuration: SelectBookshelfIntent, in context: Context) async -> WidgetsTimelineEntry {
    return buildEntry(for: configuration)
  }

  func timeline(for configuration: SelectBookshelfIntent, in context: Context) async -> Timeline<WidgetsTimelineEntry> {
    let entry = buildEntry(for: configuration)
    return Timeline(entries: [entry], policy: .atEnd)
  }

  private func buildEntry(for intent: SelectBookshelfIntent) -> WidgetsTimelineEntry {
    let timeline = WidgetsStorage.getArray(forKey: "__expo_widgets_\\(name)_timeline") ?? []
    guard let firstEntry = timeline.first as? [String: Any],
          let allProps = firstEntry["props"] as? [String: Any] else {
      return WidgetsTimelineEntry(date: Date(), name: name, props: ["isPremium": false], entryIndex: 0)
    }

    let isPremium = allProps["isPremium"] as? Bool ?? false

    guard let bookshelves = allProps["bookshelves"] as? [[String: Any]] else {
      return WidgetsTimelineEntry(date: Date(), name: name, props: ["isPremium": isPremium], entryIndex: 0)
    }

    let selectedId = intent.bookshelf?.id
    let shelf = bookshelves.first { ($0["id"] as? String) == selectedId } ?? bookshelves.first

    guard let shelf else {
      return WidgetsTimelineEntry(date: Date(), name: name, props: ["isPremium": isPremium], entryIndex: 0)
    }

    let props: [String: Any] = [
      "isPremium": isPremium,
      "bookshelfName": shelf["name"] ?? "",
      "bookshelfId": shelf["id"] ?? "",
      "books": shelf["books"] ?? []
    ]

    return WidgetsTimelineEntry(date: Date(), name: name, props: props, entryIndex: 0)
  }
}

// MARK: - Widget definition using AppIntentConfiguration

struct BookshelfWidget: Widget {
  let name: String = "BookshelfWidget"

  var body: some WidgetConfiguration {
    if #available(iOS 17.0, *) {
      return AppIntentConfiguration(
        kind: name,
        intent: SelectBookshelfIntent.self,
        provider: BookshelfConfigurableProvider()
      ) { entry in
        WidgetsEntryView(entry: entry)
      }
      .configurationDisplayName("${displayName}")
      .description("${description}")
      .supportedFamilies([.${families}])
    } else {
      return StaticConfiguration(
        kind: name,
        provider: WidgetsTimelineProvider(name: name)
      ) { entry in
        WidgetsEntryView(entry: entry)
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
  const widgetDef =
    expoWidgetsPlugin?.[1]?.widgets?.find(
      (w) => w.name === "BookshelfWidget"
    ) || {};
  const displayName = widgetDef.displayName || "My Bookshelf";
  const description =
    widgetDef.description || "Show one shelf from your library.";
  const families = (widgetDef.supportedFamilies || [
    "systemMedium",
    "systemLarge",
  ]).join(", .");
  return { displayName, description, families };
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
    const { displayName, description, families } = readWidgetMeta(config);

    fs.mkdirSync(targetDir, { recursive: true });

    const widgetSwiftPath = path.join(targetDir, "BookshelfWidget.swift");
    fs.writeFileSync(
      widgetSwiftPath,
      bookshelfWidgetSwift(displayName, description, families)
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
