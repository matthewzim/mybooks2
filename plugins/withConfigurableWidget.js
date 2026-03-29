const { withXcodeProject } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Expo config plugin that transforms the expo-widgets generated
 * BookshelfWidget from a StaticConfiguration into an AppIntentConfiguration.
 *
 * It overwrites the generated BookshelfWidget.swift with a single file that
 * contains the AppEntity, EntityQuery, WidgetConfigurationIntent, the
 * configurable timeline provider, and the widget definition itself.
 *
 * Everything lives in one file so there is no need to manually wire a second
 * Swift file into the Xcode project's build phases (which was fragile and
 * caused "cannot find type 'SelectBookshelfIntent'" build failures).
 */

const TARGET_NAME = "ExpoWidgetsTarget";

// ---------------------------------------------------------------------------
// Swift source – single file containing intents + configurable widget
// ---------------------------------------------------------------------------
const bookshelfWidgetSwift = (displayName, description, families) => `import AppIntents
import WidgetKit
import SwiftUI
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

  // Read the bookshelves array that the JS side pushes via updateSnapshot.
  // Data lives at: __expo_widgets_BookshelfWidget_timeline[0].props.bookshelves
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

  // Build a timeline entry by selecting the right bookshelf from stored data.
  // Includes the isPremium flag so the widget can gate content for free users.
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
// Plugin: overwrite the generated BookshelfWidget.swift
// ---------------------------------------------------------------------------
const withConfigurableWidget = (config) => {
  return withXcodeProject(config, (config) => {
    const projectRoot = config.modRequest.platformProjectRoot;
    const targetDir = path.join(projectRoot, TARGET_NAME);

    // This MUST happen inside withXcodeProject so it runs AFTER
    // expo-widgets has generated its default BookshelfWidget.swift
    // (which uses StaticConfiguration).
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

module.exports = withConfigurableWidget;
