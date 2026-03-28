const { withXcodeProject } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Expo config plugin that transforms the expo-widgets generated
 * BookshelfWidget from a StaticConfiguration into an AppIntentConfiguration.
 *
 * It does two things:
 *   1. Overwrites the generated BookshelfWidget.swift with a version that uses
 *      AppIntentConfiguration + a custom AppIntentTimelineProvider.
 *   2. Writes a BookshelfAppIntent.swift file that defines the AppEntity,
 *      EntityQuery, and WidgetConfigurationIntent so users can pick a shelf.
 *   3. Adds the new Swift file to the Xcode project's build phases.
 */

const TARGET_NAME = "ExpoWidgetsTarget";

// ---------------------------------------------------------------------------
// Swift source for the AppIntent (bookshelf selection)
// ---------------------------------------------------------------------------
const bookshelfAppIntentSwift = `import AppIntents
import WidgetKit
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
`;

// ---------------------------------------------------------------------------
// Swift source for the configurable widget (replaces the generated static one)
// ---------------------------------------------------------------------------
const bookshelfWidgetSwift = (displayName, description, families) => `import WidgetKit
import SwiftUI
internal import ExpoWidgets

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
// Plugin: add the new BookshelfAppIntent.swift to Xcode build sources
// ---------------------------------------------------------------------------
const withConfigurableWidgetXcode = (config) => {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectRoot = config.modRequest.platformProjectRoot;
    const targetDir = path.join(projectRoot, TARGET_NAME);

    // ---------------------------------------------------------------
    // Write (or overwrite) the Swift source files.
    // This MUST happen inside withXcodeProject so it runs AFTER
    // expo-widgets has generated its default BookshelfWidget.swift
    // (which uses StaticConfiguration).  Previously this lived in a
    // withDangerousMod handler that ran too early, so expo-widgets
    // would overwrite our AppIntentConfiguration version.
    // ---------------------------------------------------------------
    const { displayName, description, families } = readWidgetMeta(config);

    fs.mkdirSync(targetDir, { recursive: true });

    const widgetSwiftPath = path.join(targetDir, "BookshelfWidget.swift");
    fs.writeFileSync(
      widgetSwiftPath,
      bookshelfWidgetSwift(displayName, description, families)
    );

    const intentSwiftPath = path.join(targetDir, "BookshelfAppIntent.swift");
    fs.writeFileSync(intentSwiftPath, bookshelfAppIntentSwift);

    // ---------------------------------------------------------------
    // Add BookshelfAppIntent.swift to Xcode build sources
    // ---------------------------------------------------------------

    // Find the widget target's PBXNativeTarget
    const nativeTargets = project.pbxNativeTargetSection();
    let widgetTargetKey = null;
    for (const key in nativeTargets) {
      if (key.endsWith("_comment")) continue;
      const target = nativeTargets[key];
      if (target && target.name === TARGET_NAME) {
        widgetTargetKey = key;
        break;
      }
    }

    if (!widgetTargetKey) {
      console.warn(
        "withConfigurableWidget: Could not find ExpoWidgetsTarget in Xcode project"
      );
      return config;
    }

    // Find the "Sources" build phase for the widget target
    const target = nativeTargets[widgetTargetKey];
    const buildPhases = target.buildPhases || [];
    let sourcesBuildPhaseId = null;

    const sourcesBuildPhases =
      project.hash.project.objects["PBXSourcesBuildPhase"];
    for (const phase of buildPhases) {
      const phaseId = phase.value;
      if (sourcesBuildPhases && sourcesBuildPhases[phaseId]) {
        sourcesBuildPhaseId = phaseId;
        break;
      }
    }

    if (!sourcesBuildPhaseId) {
      console.warn(
        "withConfigurableWidget: Could not find Sources build phase for widget target"
      );
      return config;
    }

    // Add the file to PBXFileReference
    const fileRefUuid = project.generateUuid();
    const fileRefs =
      project.hash.project.objects["PBXFileReference"];
    fileRefs[fileRefUuid] = {
      isa: "PBXFileReference",
      lastKnownFileType: "sourcecode.swift",
      path: "BookshelfAppIntent.swift",
      sourceTree: '"<group>"',
    };
    fileRefs[`${fileRefUuid}_comment`] = "BookshelfAppIntent.swift";

    // Add to PBXBuildFile
    const buildFileUuid = project.generateUuid();
    const buildFiles =
      project.hash.project.objects["PBXBuildFile"];
    buildFiles[buildFileUuid] = {
      isa: "PBXBuildFile",
      fileRef: fileRefUuid,
      fileRef_comment: "BookshelfAppIntent.swift",
    };
    buildFiles[`${buildFileUuid}_comment`] =
      "BookshelfAppIntent.swift in Sources";

    // Add to the Sources build phase
    const sourcesPhase = sourcesBuildPhases[sourcesBuildPhaseId];
    if (sourcesPhase && sourcesPhase.files) {
      sourcesPhase.files.push({
        value: buildFileUuid,
        comment: "BookshelfAppIntent.swift in Sources",
      });
    }

    // Add to the PBXGroup for the widget target
    const groups = project.hash.project.objects["PBXGroup"];
    for (const groupKey in groups) {
      if (groupKey.endsWith("_comment")) continue;
      const group = groups[groupKey];
      if (group && group.name === TARGET_NAME && group.children) {
        group.children.push({
          value: fileRefUuid,
          comment: "BookshelfAppIntent.swift",
        });
        break;
      }
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
