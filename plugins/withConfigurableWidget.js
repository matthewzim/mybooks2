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
import UIKit
import ImageIO

// MARK: - Shared UserDefaults helper (replaces internal ExpoWidgets WidgetsStorage)

private enum WidgetDataStore {
  static let suiteName = "${groupIdentifier}"
  // expo-widgets may use different key formats across versions
  static let timelineKeys = [
    "__expo_widgets_BookshelfWidget_timeline",
    "BookshelfWidget_timeline",
    "__expo_widgets_BookshelfWidget"
  ]

  static func getTimeline() -> [[String: Any]] {
    let allDefaults: [UserDefaults] = {
      var list: [UserDefaults] = []
      if let grouped = UserDefaults(suiteName: suiteName) { list.append(grouped) }
      list.append(.standard)
      return list
    }()

    for defaults in allDefaults {
      for key in timelineKeys {
        // 1. Native array of dictionaries
        if let arr = defaults.array(forKey: key) as? [[String: Any]] {
          return arr
        }
        // 2. Native dictionary (single snapshot)
        if let dict = defaults.dictionary(forKey: key) {
          return [dict]
        }
        // 3. JSON-encoded string (expo-widgets may serialize props as JSON)
        if let jsonString = defaults.string(forKey: key),
           let jsonData = jsonString.data(using: .utf8) {
          if let arr = try? JSONSerialization.jsonObject(with: jsonData) as? [[String: Any]] {
            return arr
          }
          if let dict = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any] {
            return [dict]
          }
        }
        // 4. Raw Data blob (another possible serialization format)
        if let rawData = defaults.data(forKey: key) {
          if let arr = try? JSONSerialization.jsonObject(with: rawData) as? [[String: Any]] {
            return arr
          }
          if let dict = try? JSONSerialization.jsonObject(with: rawData) as? [String: Any] {
            return [dict]
          }
        }
      }
    }

    return []
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

// MARK: - App background color (always the light theme, regardless of system appearance)

private var appBackgroundColor: Color {
  // #fbf6ec
  Color(red: 251/255, green: 246/255, blue: 236/255)
}

// MARK: - Color helpers

/// Parses a "#rgb" / "#rrggbb" hex string into 0-255 channel values.
private func hexChannels(_ hex: String?) -> (Double, Double, Double)? {
  guard let raw = hex?.trimmingCharacters(in: .whitespacesAndNewlines),
        raw.hasPrefix("#") else { return nil }
  var stripped = String(raw.dropFirst())
  if stripped.count == 3 {
    var expanded = ""
    for ch in stripped {
      expanded.append(ch)
      expanded.append(ch)
    }
    stripped = expanded
  }
  guard stripped.count == 6, let val = UInt64(stripped, radix: 16) else { return nil }
  return (
    Double((val >> 16) & 0xFF),
    Double((val >> 8) & 0xFF),
    Double(val & 0xFF)
  )
}

/// Builds a Color from 0-255 channels, optionally shifted by a brightness
/// amount (mirrors adjustHexBrightness in utils/shelfColors.ts).
private func channelColor(_ rgb: (Double, Double, Double), adjustedBy amount: Double = 0) -> Color {
  Color(
    red: min(255, max(0, rgb.0 + amount)) / 255.0,
    green: min(255, max(0, rgb.1 + amount)) / 255.0,
    blue: min(255, max(0, rgb.2 + amount)) / 255.0
  )
}

/// Shelf palette derived from the bookshelf cover color — a direct port of
/// getShelfColors in utils/shelfColors.ts plus the Wood tokens in
/// constants/theme.ts, so widget shelves match the in-app cabinet.
private struct ShelfPalette {
  let plankTop: Color
  let plankBottom: Color
  let frameTop: Color
  let frameBottom: Color
  let frameEdge: Color
  let backTop: Color
  let backBottom: Color

  /// Wood.plankHighlight: rgba(255, 220, 170, 0.35)
  static let plankHighlight = Color(red: 1.0, green: 220.0 / 255.0, blue: 170.0 / 255.0).opacity(0.35)
}

private func shelfPalette(for coverColor: String?) -> ShelfPalette {
  // The warm lit back wall stays constant so books remain readable
  // (Wood.backTop #e9dcc2 / Wood.backBottom #f1e6cf).
  let backTop = channelColor((0xE9, 0xDC, 0xC2))
  let backBottom = channelColor((0xF1, 0xE6, 0xCF))

  // Default wood cabinet when there is no custom cover color, or when the
  // cover color equals the default shelf color (Wood.plankTop #7a4f2c).
  let isDefault = coverColor?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "#7a4f2c"
  guard let rgb = hexChannels(coverColor), !isDefault else {
    return ShelfPalette(
      plankTop: channelColor((0x7A, 0x4F, 0x2C)),
      plankBottom: channelColor((0x5C, 0x3A, 0x1F)),
      frameTop: channelColor((0x8A, 0x5A, 0x30)),
      frameBottom: channelColor((0x6E, 0x43, 0x24)),
      frameEdge: channelColor((0xB9, 0x8A, 0x52)),
      backTop: backTop,
      backBottom: backBottom
    )
  }

  // Custom cover colors tint the plank and frame, same offsets as the app.
  return ShelfPalette(
    plankTop: channelColor(rgb, adjustedBy: 8),
    plankBottom: channelColor(rgb, adjustedBy: -32),
    frameTop: channelColor(rgb, adjustedBy: 18),
    frameBottom: channelColor(rgb, adjustedBy: -18),
    frameEdge: channelColor(rgb, adjustedBy: 56),
    backTop: backTop,
    backBottom: backBottom
  )
}

// MARK: - Native SwiftUI widget view

struct BookshelfWidgetView: View {
  let entry: BookshelfEntry
  @Environment(\\.widgetFamily) var family

  private var palette: ShelfPalette {
    shelfPalette(for: entry.coverColor)
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
          .widgetURL(deepLinkURL)
      }
    }
  }

  /// Deep link into the selected shelf when the widget is tapped.
  /// expo-router resolves virtuallibrary://bookshelf?id=<id> to the
  /// bookshelf detail screen automatically.
  private var deepLinkURL: URL? {
    guard let shelfId = entry.bookshelfId,
          var components = URLComponents(string: "virtuallibrary://bookshelf") else { return nil }
    components.queryItems = [URLQueryItem(name: "id", value: shelfId)]
    return components.url
  }

  private var maxVisibleBooks: Int {
    family == .systemMedium ? 15 : 30
  }

  private var spineHeight: CGFloat {
    family == .systemMedium ? 108 : 124
  }

  private var shelfThickness: CGFloat { 8 }

  /// Cabinet corner rounding matching the in-app cabinet (BorderRadius.lg).
  private var cabinetCornerRadius: CGFloat { 12 }

  @ViewBuilder
  private var bookshelfContent: some View {
    GeometryReader { geo in
      let margin: CGFloat = 8
      let availableWidth = geo.size.width - 2 * margin
      // A row also spends width on the shelf's side padding; without
      // subtracting it, a full row of max-width spines overflows the shelf
      // past the widget's right margin.
      let rowSidePadding: CGFloat = isBottomStyle ? 3 : shelfThickness
      let rowContentWidth = availableWidth - 2 * rowSidePadding
      let baseSpineWidth = min(42, max(20, rowContentWidth / 7))

      // Compute spine height so shelves fill the widget with equal margins
      // on all sides. Each full-style row carries a frame strip on top (like
      // the in-app cabinet rows) and the cabinet adds one frame strip at the
      // bottom; bottom-style rows add a little headroom plus the plank.
      let perShelfOverhead: CGFloat = isBottomStyle ? 6 + shelfThickness : shelfThickness
      let cabinetBottomExtra: CGFloat = isBottomStyle ? 0 : shelfThickness
      let shelfCount: CGFloat = family == .systemLarge ? 2 : 1
      let rowSpineHeight: CGFloat = (geo.size.height - 2 * margin - shelfCount * perShelfOverhead - cabinetBottomExtra) / shelfCount

      // Rows fill by actual spine width, not a fixed count: a book only
      // moves to the second shelf once the first shelf has no room left.
      let visible = Array(entry.books.prefix(maxVisibleBooks))
      let layouts = spineLayouts(for: visible, baseSpineWidth: baseSpineWidth, rowSpineHeight: rowSpineHeight)
      let rows = splitIntoRows(layouts: layouts, rowContentWidth: rowContentWidth, rowCount: family == .systemLarge ? 2 : 1)

      Group {
        if isBottomStyle {
          // Open shelf: rows of spines resting on floating planks
          VStack(alignment: .leading, spacing: 0) {
            shelfRow(layouts: rows[0], rowSpineHeight: rowSpineHeight)

            if family == .systemLarge {
              shelfRow(layouts: rows[1], rowSpineHeight: rowSpineHeight)
            }
          }
        } else {
          // Classic cabinet: rounded wood frame around all rows, matching
          // the in-app EditableBookshelfGrid cabinet.
          VStack(alignment: .leading, spacing: 0) {
            cabinetRow(layouts: rows[0], rowSpineHeight: rowSpineHeight)

            if family == .systemLarge {
              cabinetRow(layouts: rows[1], rowSpineHeight: rowSpineHeight)
            }
          }
          .padding(.bottom, shelfThickness)
          .background(
            LinearGradient(
              colors: [palette.frameTop, palette.frameBottom],
              startPoint: .top,
              endPoint: .bottom
            )
          )
          .clipShape(RoundedRectangle(cornerRadius: cabinetCornerRadius))
          .overlay(
            RoundedRectangle(cornerRadius: cabinetCornerRadius)
              .stroke(palette.frameEdge, lineWidth: 1)
          )
        }
      }
      .padding(margin)
    }
  }

  private var isBottomStyle: Bool {
    entry.shelfStyle == "bottom"
  }

  /// One row inside the cabinet: the warm lit back panel behind
  /// bottom-aligned spines, framed by the cabinet gradient showing through
  /// the top/side insets — mirroring the in-app cabinet rows. Books rest
  /// directly on the frame strip below the row (no plank).
  private func cabinetRow(layouts: [SpineLayout], rowSpineHeight: CGFloat) -> some View {
    // Like the in-app bookshelf: spines sit flush against each other
    // (spacing 0) and rest on the shelf (bottom alignment).
    ZStack(alignment: .bottom) {
      // Warm lit back panel behind the books (Wood.backTop → backBottom)
      LinearGradient(
        colors: [palette.backTop, palette.backBottom],
        startPoint: .top,
        endPoint: .bottom
      )

      HStack(alignment: .bottom, spacing: 0) {
        ForEach(Array(layouts.enumerated()), id: \\.offset) { _, layout in
          spineView(layout: layout)
        }
        Spacer(minLength: 0)
      }
    }
    .frame(height: rowSpineHeight)
    .padding(.top, shelfThickness)
    .padding(.horizontal, shelfThickness)
  }

  /// One open-shelf row: spines sitting on a full-width floating plank.
  private func shelfRow(layouts: [SpineLayout], rowSpineHeight: CGFloat) -> some View {
    VStack(spacing: 0) {
      HStack(alignment: .bottom, spacing: 0) {
        ForEach(Array(layouts.enumerated()), id: \\.offset) { _, layout in
          spineView(layout: layout)
        }
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 3)
      .frame(height: rowSpineHeight + 6, alignment: .bottom)

      shelfPlank
    }
  }

  /// Shelf plank: wood gradient with a lit top highlight and drop shadow so
  /// books read as sitting on the surface (in-app ShelfPlank).
  private var shelfPlank: some View {
    ZStack(alignment: .top) {
      LinearGradient(
        colors: [palette.plankTop, palette.plankBottom],
        startPoint: .top,
        endPoint: .bottom
      )
      ShelfPalette.plankHighlight
        .frame(height: 1.5)
    }
    .frame(height: shelfThickness)
    .cornerRadius(2)
    .shadow(color: .black.opacity(0.3), radius: 2, x: 0, y: 2)
  }

  private struct SpineLayout {
    let title: String
    let width: CGFloat
    let height: CGFloat
    let image: UIImage?
  }

  /// Computes each spine's frame like the in-app bookshelf grid: the width
  /// follows the image's natural aspect ratio at the spine's display height,
  /// so the image fills its frame exactly and adjacent spines touch with no
  /// letterboxing gaps.
  private func spineLayouts(for books: [[String: Any]], baseSpineWidth: CGFloat, rowSpineHeight: CGFloat) -> [SpineLayout] {
    let minSpineWidth: CGFloat = 12
    let maxSpineWidth: CGFloat = 42

    return books.map { book in
      let bookId = book["id"] as? String ?? ""
      let title = book["title"] as? String ?? ""
      let heightFactor = imageHeightFactor(bookId: bookId, title: title)
      let height = rowSpineHeight * heightFactor

      if let imageData = entry.bookImages[bookId],
         let uiImage = UIImage(data: imageData),
         uiImage.size.height > 0 {
        let aspect = uiImage.size.width / uiImage.size.height
        let width = min(maxSpineWidth, max(minSpineWidth, height * aspect))
        return SpineLayout(title: title, width: width, height: height, image: uiImage)
      }

      return SpineLayout(title: title, width: baseSpineWidth, height: height, image: nil)
    }
  }

  /// Distributes spines across shelf rows by their actual widths: spines
  /// stay on the current row until the next one no longer fits, and only
  /// then start filling the next row. Spines that don't fit on the last
  /// row are dropped. Always returns exactly rowCount rows (possibly empty).
  private func splitIntoRows(layouts: [SpineLayout], rowContentWidth: CGFloat, rowCount: Int) -> [[SpineLayout]] {
    var rows: [[SpineLayout]] = Array(repeating: [], count: rowCount)
    var rowIndex = 0
    var usedWidth: CGFloat = 0

    for layout in layouts {
      if usedWidth + layout.width > rowContentWidth && !rows[rowIndex].isEmpty {
        rowIndex += 1
        usedWidth = 0
        if rowIndex >= rowCount { break }
      }
      rows[rowIndex].append(layout)
      usedWidth += layout.width
    }

    return rows
  }

  /// Horizontal sheen over placeholder spines so they read as a rounded
  /// cloth surface (SPINE_SHEEN_COLORS / SPINE_SHEEN_LOCATIONS in
  /// components/BookSpine.tsx).
  private var spineSheen: LinearGradient {
    LinearGradient(
      stops: [
        .init(color: Color.white.opacity(0.16), location: 0),
        .init(color: Color.clear, location: 0.24),
        .init(color: Color.black.opacity(0.16), location: 0.72),
        .init(color: Color.black.opacity(0.34), location: 1),
      ],
      startPoint: .leading,
      endPoint: .trailing
    )
  }

  @ViewBuilder
  private func spineView(layout: SpineLayout) -> some View {
    Group {
      if let uiImage = layout.image {
        // The frame already matches the image's aspect ratio (barring width
        // clamping), so .fill renders edge to edge with no letterbox gaps.
        Image(uiImage: uiImage)
          .resizable()
          .aspectRatio(contentMode: .fill)
          .frame(width: layout.width, height: layout.height)
      } else {
        Rectangle()
          .fill(stableColor(for: layout.title))
          .overlay(spineSheen)
          .overlay(
            Text(String(layout.title.prefix(1)))
              .font(.system(size: round(layout.width * 0.38), weight: .bold))
              .foregroundColor(.white)
          )
          .frame(width: layout.width, height: layout.height)
      }
    }
    // Rounded like the in-app BookSpine (3pt top corners, 1pt bottom)
    .clipShape(SpineShape())
    // Warm cast shadow so the book sits on the plank (in-app spine shadow
    // color #32190a, scaled down to widget size)
    .shadow(color: Color(red: 0.196, green: 0.098, blue: 0.039).opacity(0.35), radius: 3, x: 0, y: 3)
  }

  private func stableColor(for title: String) -> Color {
    var hash = 0
    for ch in title.unicodeScalars { hash += Int(ch.value) }
    let hue = Double(hash % 360) / 360.0
    return Color(hue: hue, saturation: 0.5, brightness: 0.55)
  }

  private func imageHeightFactor(bookId: String, title: String) -> CGFloat {
    let minFactor: CGFloat = 0.8
    let maxFactor: CGFloat = 0.95
    let normalized = seededNormalized(bookId: bookId, title: title, salt: "image-height")
    return minFactor + (maxFactor - minFactor) * normalized
  }

  private func seededNormalized(bookId: String, title: String, salt: String) -> CGFloat {
    let source = "\\(bookId)-\\(title)-\\(salt)"
    // Mirrors the JS hash in utils/placeholderSpine.ts. In JS, "hash << 5"
    // wraps to Int32 and the additions never trap; Swift's default +/-
    // crash on overflow, so wrap the shift to Int32 and keep the running
    // value in Int64 (bounded, so the +/- below can never overflow).
    var hash: Int64 = 0
    for unit in source.utf16 {
      let shifted = Int64(Int32(truncatingIfNeeded: hash) << 5)
      hash = Int64(unit) + (shifted - hash)
    }

    return CGFloat(abs(hash % 1000)) / 1000.0
  }
}

// MARK: - Spine shape (rounded like the in-app BookSpine)

/// Book spine outline with asymmetric corner rounding, matching the in-app
/// BookSpine spineBody (borderTopRadius 3, borderBottomRadius 1). A custom
/// Shape is used instead of UnevenRoundedRectangle so pre-iOS 16 widget
/// builds keep compiling.
private struct SpineShape: Shape {
  var topRadius: CGFloat = 3
  var bottomRadius: CGFloat = 1

  func path(in rect: CGRect) -> Path {
    let top = min(topRadius, min(rect.width, rect.height) / 2)
    let bottom = min(bottomRadius, min(rect.width, rect.height) / 2)
    var path = Path()
    path.move(to: CGPoint(x: rect.minX, y: rect.minY + top))
    path.addArc(
      center: CGPoint(x: rect.minX + top, y: rect.minY + top),
      radius: top, startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false
    )
    path.addLine(to: CGPoint(x: rect.maxX - top, y: rect.minY))
    path.addArc(
      center: CGPoint(x: rect.maxX - top, y: rect.minY + top),
      radius: top, startAngle: .degrees(270), endAngle: .degrees(0), clockwise: false
    )
    path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - bottom))
    path.addArc(
      center: CGPoint(x: rect.maxX - bottom, y: rect.maxY - bottom),
      radius: bottom, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false
    )
    path.addLine(to: CGPoint(x: rect.minX + bottom, y: rect.maxY))
    path.addArc(
      center: CGPoint(x: rect.minX + bottom, y: rect.maxY - bottom),
      radius: bottom, startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false
    )
    path.closeSubpath()
    return path
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
    guard let firstEntry = timeline.first else { return [] }
    let props = (firstEntry["props"] as? [String: Any]) ?? firstEntry
    guard let shelves = props["bookshelves"] as? [[String: Any]] else {
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

/// Attempt to read a Bool from a dictionary value that might be Bool, NSNumber, or Int.
private func readBool(_ dict: [String: Any], key: String, fallback: Bool = false) -> Bool {
  if let b = dict[key] as? Bool { return b }
  if let n = dict[key] as? NSNumber { return n.boolValue }
  if let n = dict[key] as? Int { return n != 0 }
  return fallback
}

private func buildBookshelfEntry(selectedId: String?) -> BookshelfEntry {
  let timeline = WidgetDataStore.getTimeline()
  guard let firstEntry = timeline.first else {
    return BookshelfEntry(date: Date(), isPremium: false, bookshelfName: nil, bookshelfId: nil, coverColor: nil, shelfStyle: "full", books: [], bookImages: [:])
  }

  // Props may be nested under "props" key or at the top level depending on expo-widgets version.
  // Also try "snapshot" or "data" nesting that some versions use.
  let allProps: [String: Any] = {
    for key in ["props", "snapshot", "data"] {
      if let nested = firstEntry[key] as? [String: Any] { return nested }
    }
    return firstEntry
  }()

  let isPremium = readBool(allProps, key: "isPremium", fallback: false)

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

/// Downsamples image data so decoded bitmaps stay small.  The widget
/// extension has a hard memory ceiling around 30MB; full-resolution spine
/// photos (multi-MB JPEGs that decode to tens of MB of bitmap) get the
/// process killed by the system, leaving the widget stuck on its redacted
/// placeholder.  Spines render at most ~42pt wide, so 400px is plenty.
private func downsampledImageData(_ data: Data, maxPixelSize: CGFloat) -> Data? {
  let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
  guard let source = CGImageSourceCreateWithData(data as CFData, sourceOptions) else { return nil }
  let thumbnailOptions = [
    kCGImageSourceCreateThumbnailFromImageAlways: true,
    kCGImageSourceCreateThumbnailWithTransform: true,
    kCGImageSourceShouldCacheImmediately: true,
    kCGImageSourceThumbnailMaxPixelSize: maxPixelSize
  ] as CFDictionary
  guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbnailOptions) else { return nil }
  return UIImage(cgImage: cgImage).jpegData(compressionQuality: 0.85)
}

/// Downloads book spine images for display in the widget.
/// Uses a per-image timeout so one slow download doesn't block the whole widget.
/// Fetches in small batches and downsamples each image as soon as it arrives
/// so only a few full-size payloads are ever in memory at once.
private func downloadBookImages(for books: [[String: Any]], limit: Int) async -> [String: Data] {
  var result: [String: Data] = [:]
  let booksToFetch = Array(books.prefix(limit))
  let config = URLSessionConfiguration.default
  config.timeoutIntervalForRequest = 8
  config.timeoutIntervalForResource = 12
  let session = URLSession(configuration: config)

  let batchSize = 4
  var index = 0
  while index < booksToFetch.count {
    let batch = booksToFetch[index..<min(index + batchSize, booksToFetch.count)]
    await withTaskGroup(of: (String, Data?).self) { group in
      for book in batch {
        guard let id = book["id"] as? String,
              let urlString = book["resolvedImageUrl"] as? String,
              !urlString.isEmpty,
              let url = URL(string: urlString) else { continue }
        group.addTask {
          do {
            let (data, response) = try await session.data(from: url)
            if let httpResponse = response as? HTTPURLResponse,
               httpResponse.statusCode == 200 {
              return (id, downsampledImageData(data, maxPixelSize: 400))
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
    index += batchSize
  }
  return result
}

// MARK: - Configurable timeline provider (iOS 17+)

@available(iOS 17.0, *)
struct BookshelfConfigurableProvider: AppIntentTimelineProvider {
  typealias Entry = BookshelfEntry
  typealias Intent = SelectBookshelfIntent

  func placeholder(in context: Context) -> BookshelfEntry {
    // Rendered (redacted) while the first timeline loads — show an empty
    // shelf instead of gated/empty-state text so it reads as a bookshelf.
    BookshelfEntry(date: Date(), isPremium: true, bookshelfName: "My Shelf", bookshelfId: "placeholder", coverColor: nil, shelfStyle: "full", books: [], bookImages: [:])
  }

  func snapshot(for configuration: SelectBookshelfIntent, in context: Context) async -> BookshelfEntry {
    var entry = buildBookshelfEntry(selectedId: configuration.bookshelf?.id)
    let maxImages = context.family == .systemMedium ? 15 : 30
    let images = await downloadBookImages(for: entry.books, limit: maxImages)
    entry = BookshelfEntry(date: entry.date, isPremium: entry.isPremium, bookshelfName: entry.bookshelfName, bookshelfId: entry.bookshelfId, coverColor: entry.coverColor, shelfStyle: entry.shelfStyle, books: entry.books, bookImages: images)
    return entry
  }

  func timeline(for configuration: SelectBookshelfIntent, in context: Context) async -> Timeline<BookshelfEntry> {
    var entry = buildBookshelfEntry(selectedId: configuration.bookshelf?.id)
    let maxImages = context.family == .systemMedium ? 15 : 30
    let images = await downloadBookImages(for: entry.books, limit: maxImages)
    entry = BookshelfEntry(date: entry.date, isPremium: entry.isPremium, bookshelfName: entry.bookshelfName, bookshelfId: entry.bookshelfId, coverColor: entry.coverColor, shelfStyle: entry.shelfStyle, books: entry.books, bookImages: images)
    // The app reloads the widget whenever data changes (expo-widgets
    // updateSnapshot); with a single entry, .atEnd would make WidgetKit
    // re-request the timeline (and re-download images) as often as the
    // refresh budget allows.
    return Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(6 * 60 * 60)))
  }
}

// MARK: - Static timeline provider (pre-iOS 17 fallback)

struct BookshelfStaticProvider: TimelineProvider {
  typealias Entry = BookshelfEntry

  func placeholder(in context: Context) -> BookshelfEntry {
    BookshelfEntry(date: Date(), isPremium: true, bookshelfName: "My Shelf", bookshelfId: "placeholder", coverColor: nil, shelfStyle: "full", books: [], bookImages: [:])
  }

  func getSnapshot(in context: Context, completion: @escaping (BookshelfEntry) -> Void) {
    let entry = buildBookshelfEntry(selectedId: nil)
    let maxImages = context.family == .systemMedium ? 15 : 30
    Task {
      let images = await downloadBookImages(for: entry.books, limit: maxImages)
      let finalEntry = BookshelfEntry(date: entry.date, isPremium: entry.isPremium, bookshelfName: entry.bookshelfName, bookshelfId: entry.bookshelfId, coverColor: entry.coverColor, shelfStyle: entry.shelfStyle, books: entry.books, bookImages: images)
      completion(finalEntry)
    }
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<BookshelfEntry>) -> Void) {
    let entry = buildBookshelfEntry(selectedId: nil)
    let maxImages = context.family == .systemMedium ? 15 : 30
    Task {
      let images = await downloadBookImages(for: entry.books, limit: maxImages)
      let finalEntry = BookshelfEntry(date: entry.date, isPremium: entry.isPremium, bookshelfName: entry.bookshelfName, bookshelfId: entry.bookshelfId, coverColor: entry.coverColor, shelfStyle: entry.shelfStyle, books: entry.books, bookImages: images)
      completion(Timeline(entries: [finalEntry], policy: .after(Date().addingTimeInterval(6 * 60 * 60))))
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
