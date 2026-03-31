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
  let coverColor: String?
  let shelfStyle: String
  let books: [[String: Any]]
  let bookImages: [String: Data]
}

// MARK: - App background color (matches main app theme)

private var appBackgroundColor: Color {
  Color(UIColor { traitCollection in
    if traitCollection.userInterfaceStyle == .dark {
      // Dark theme: #0b1220
      return UIColor(red: 11/255, green: 18/255, blue: 32/255, alpha: 1)
    } else {
      // Light theme: #fbf6ec
      return UIColor(red: 251/255, green: 246/255, blue: 236/255, alpha: 1)
    }
  })
}

// MARK: - Color helpers

private func hexToColor(_ hex: String?) -> Color? {
  guard let hex = hex?.trimmingCharacters(in: .whitespacesAndNewlines),
        hex.hasPrefix("#") else { return nil }
  let stripped = String(hex.dropFirst())
  guard stripped.count == 6, let val = UInt64(stripped, radix: 16) else { return nil }
  let r = Double((val >> 16) & 0xFF) / 255.0
  let g = Double((val >> 8) & 0xFF) / 255.0
  let b = Double(val & 0xFF) / 255.0
  return Color(red: r, green: g, blue: b)
}

private func darkenColor(_ hex: String?, amount: Double = 0.14) -> Color {
  guard let hex = hex?.trimmingCharacters(in: .whitespacesAndNewlines),
        hex.hasPrefix("#") else { return Color(red: 0.396, green: 0.263, blue: 0.129) }
  let stripped = String(hex.dropFirst())
  guard stripped.count == 6, let val = UInt64(stripped, radix: 16) else {
    return Color(red: 0.396, green: 0.263, blue: 0.129)
  }
  let r = max(0, Double((val >> 16) & 0xFF) / 255.0 - amount)
  let g = max(0, Double((val >> 8) & 0xFF) / 255.0 - amount)
  let b = max(0, Double(val & 0xFF) / 255.0 - amount)
  return Color(red: r, green: g, blue: b)
}

// MARK: - Native SwiftUI widget view

struct BookshelfWidgetView: View {
  let entry: BookshelfEntry
  @Environment(\\.widgetFamily) var family

  private var shelfColor: Color {
    hexToColor(entry.coverColor) ?? Color(red: 0.545, green: 0.271, blue: 0.075)
  }
  private var shelfBackColor: Color {
    darkenColor(entry.coverColor)
  }

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

  private var booksPerRow: Int { 7 }

  private var spineHeight: CGFloat {
    family == .systemMedium ? 122 : 124
  }

  private var shelfThickness: CGFloat { 8 }

  @ViewBuilder
  private var bookshelfContent: some View {
    let visible = Array(entry.books.prefix(family == .systemMedium ? booksPerRow : booksPerRow * 2))
    let topRow = Array(visible.prefix(booksPerRow))
    let bottomRow = family == .systemLarge ? Array(visible.dropFirst(booksPerRow).prefix(booksPerRow)) : []

    GeometryReader { geo in
      let availableWidth = geo.size.width - 16
      let spineWidth = min(42, max(28, availableWidth / CGFloat(booksPerRow)))

      VStack(alignment: .leading, spacing: 0) {
        // First shelf row
        shelfRow(books: topRow, spineWidth: spineWidth)

        if family == .systemLarge {
          Spacer().frame(height: 16)

          // Second shelf row
          shelfRow(books: bottomRow, spineWidth: spineWidth)
        }

        Spacer(minLength: 0)
      }
    }
  }

  private var isBottomStyle: Bool {
    entry.shelfStyle == "bottom"
  }

  private func shelfRow(books: [[String: Any]], spineWidth: CGFloat) -> some View {
    VStack(spacing: 0) {
      if isBottomStyle {
        // Bottom line shelf: no background, just spines sitting on a ledge
        HStack(spacing: 1) {
          ForEach(Array(books.enumerated()), id: \\.offset) { _, book in
            spineView(book: book, width: spineWidth, height: spineHeight)
          }
          Spacer(minLength: 0)
        }
        .padding(.horizontal, 3)
        .frame(height: spineHeight + 6)
      } else {
        // Full shelf: spines on a background with uniform border
        ZStack(alignment: .bottom) {
          // Shelf background
          shelfBackColor
            .cornerRadius(2)

          // Book spines aligned to bottom
          HStack(spacing: 1) {
            ForEach(Array(books.enumerated()), id: \\.offset) { _, book in
              spineView(book: book, width: spineWidth, height: spineHeight)
            }
            Spacer(minLength: 0)
          }
          .padding(.horizontal, shelfThickness)
        }
        .frame(height: spineHeight + shelfThickness)
      }

      // Shelf ledge
      shelfColor
        .frame(height: shelfThickness)
        .shadow(color: .black.opacity(0.3), radius: 2, x: 0, y: 2)
    }
  }

  @ViewBuilder
  private func spineView(book: [String: Any], width: CGFloat, height: CGFloat) -> some View {
    let bookId = book["id"] as? String ?? ""
    let title = book["title"] as? String ?? ""

    if let imageData = entry.bookImages[bookId],
       let uiImage = UIImage(data: imageData) {
      Image(uiImage: uiImage)
        .resizable()
        .aspectRatio(contentMode: .fit)
        .frame(height: height)
        .clipped()
        .cornerRadius(1)
    } else {
      RoundedRectangle(cornerRadius: 1)
        .fill(stableColor(for: title))
        .frame(width: width, height: height)
        .overlay(
          Text(String(title.prefix(1)))
            .font(.system(size: round(width * 0.38), weight: .bold))
            .foregroundColor(.white)
        )
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
    return BookshelfEntry(date: Date(), isPremium: false, bookshelfName: nil, bookshelfId: nil, coverColor: nil, shelfStyle: "full", books: [], bookImages: [:])
  }

  let isPremium = allProps["isPremium"] as? Bool ?? false

  guard let bookshelves = allProps["bookshelves"] as? [[String: Any]] else {
    return BookshelfEntry(date: Date(), isPremium: isPremium, bookshelfName: nil, bookshelfId: nil, coverColor: nil, shelfStyle: "full", books: [], bookImages: [:])
  }

  let shelf = bookshelves.first { ($0["id"] as? String) == selectedId } ?? bookshelves.first

  guard let shelf else {
    return BookshelfEntry(date: Date(), isPremium: isPremium, bookshelfName: nil, bookshelfId: nil, coverColor: nil, shelfStyle: "full", books: [], bookImages: [:])
  }

  return BookshelfEntry(
    date: Date(),
    isPremium: isPremium,
    bookshelfName: shelf["name"] as? String,
    bookshelfId: shelf["id"] as? String,
    coverColor: shelf["coverColor"] as? String,
    shelfStyle: shelf["shelfStyle"] as? String ?? "full",
    books: shelf["books"] as? [[String: Any]] ?? [],
    bookImages: [:]
  )
}

/// Downloads book spine images for display in the widget.
private func downloadBookImages(for books: [[String: Any]], limit: Int) async -> [String: Data] {
  var result: [String: Data] = [:]
  let booksToFetch = Array(books.prefix(limit))
  await withTaskGroup(of: (String, Data?).self) { group in
    for book in booksToFetch {
      guard let id = book["id"] as? String,
            let urlString = book["resolvedImageUrl"] as? String,
            !urlString.isEmpty,
            let url = URL(string: urlString) else { continue }
      group.addTask {
        do {
          let (data, response) = try await URLSession.shared.data(from: url)
          if let httpResponse = response as? HTTPURLResponse,
             httpResponse.statusCode == 200 {
            return (id, data)
          }
        } catch {}
        return (id, nil)
      }
    }
    for await (id, data) in group {
      if let data = data {
        result[id] = data
      }
    }
  }
  return result
}

// MARK: - Configurable timeline provider (iOS 17+)

@available(iOS 17.0, *)
struct BookshelfConfigurableProvider: AppIntentTimelineProvider {
  typealias Entry = BookshelfEntry
  typealias Intent = SelectBookshelfIntent

  func placeholder(in context: Context) -> BookshelfEntry {
    BookshelfEntry(date: Date(), isPremium: false, bookshelfName: nil, bookshelfId: nil, coverColor: nil, shelfStyle: "full", books: [], bookImages: [:])
  }

  func snapshot(for configuration: SelectBookshelfIntent, in context: Context) async -> BookshelfEntry {
    var entry = buildBookshelfEntry(selectedId: configuration.bookshelf?.id)
    let maxImages = context.family == .systemMedium ? 7 : 14
    let images = await downloadBookImages(for: entry.books, limit: maxImages)
    entry = BookshelfEntry(date: entry.date, isPremium: entry.isPremium, bookshelfName: entry.bookshelfName, bookshelfId: entry.bookshelfId, coverColor: entry.coverColor, shelfStyle: entry.shelfStyle, books: entry.books, bookImages: images)
    return entry
  }

  func timeline(for configuration: SelectBookshelfIntent, in context: Context) async -> Timeline<BookshelfEntry> {
    var entry = buildBookshelfEntry(selectedId: configuration.bookshelf?.id)
    let maxImages = context.family == .systemMedium ? 7 : 14
    let images = await downloadBookImages(for: entry.books, limit: maxImages)
    entry = BookshelfEntry(date: entry.date, isPremium: entry.isPremium, bookshelfName: entry.bookshelfName, bookshelfId: entry.bookshelfId, coverColor: entry.coverColor, shelfStyle: entry.shelfStyle, books: entry.books, bookImages: images)
    return Timeline(entries: [entry], policy: .atEnd)
  }
}

// MARK: - Static timeline provider (pre-iOS 17 fallback)

struct BookshelfStaticProvider: TimelineProvider {
  typealias Entry = BookshelfEntry

  func placeholder(in context: Context) -> BookshelfEntry {
    BookshelfEntry(date: Date(), isPremium: false, bookshelfName: nil, bookshelfId: nil, coverColor: nil, shelfStyle: "full", books: [], bookImages: [:])
  }

  func getSnapshot(in context: Context, completion: @escaping (BookshelfEntry) -> Void) {
    let entry = buildBookshelfEntry(selectedId: nil)
    let maxImages = context.family == .systemMedium ? 7 : 14
    Task {
      let images = await downloadBookImages(for: entry.books, limit: maxImages)
      let finalEntry = BookshelfEntry(date: entry.date, isPremium: entry.isPremium, bookshelfName: entry.bookshelfName, bookshelfId: entry.bookshelfId, coverColor: entry.coverColor, shelfStyle: entry.shelfStyle, books: entry.books, bookImages: images)
      completion(finalEntry)
    }
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<BookshelfEntry>) -> Void) {
    let entry = buildBookshelfEntry(selectedId: nil)
    let maxImages = context.family == .systemMedium ? 7 : 14
    Task {
      let images = await downloadBookImages(for: entry.books, limit: maxImages)
      let finalEntry = BookshelfEntry(date: entry.date, isPremium: entry.isPremium, bookshelfName: entry.bookshelfName, bookshelfId: entry.bookshelfId, coverColor: entry.coverColor, shelfStyle: entry.shelfStyle, books: entry.books, bookImages: images)
      completion(Timeline(entries: [finalEntry], policy: .atEnd))
    }
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
          .containerBackground(appBackgroundColor, for: .widget)
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
          .background(appBackgroundColor)
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
