import WidgetKit
import SwiftUI

// MARK: - Data Models

struct WidgetBook: Codable, Identifiable {
    let id: String
    let title: String
    let author: String
    let image_url: String?
}

struct WidgetBookshelf: Codable {
    let id: String
    let name: String
    let books: [WidgetBook]
}

struct WidgetData: Codable {
    let bookshelf: WidgetBookshelf?
    let lastUpdated: String?
}

// MARK: - Shared Storage

struct SharedStorage {
    static let appGroup = "group.com.yourcompany.virtuallibrary"
    static let dataKey = "widgetData"

    static func loadWidgetData() -> WidgetData? {
        guard let defaults = UserDefaults(suiteName: appGroup),
              let jsonString = defaults.string(forKey: dataKey),
              let data = jsonString.data(using: .utf8)
        else { return nil }

        return try? JSONDecoder().decode(WidgetData.self, from: data)
    }
}

// MARK: - Timeline Provider

struct BookshelfTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> BookshelfEntry {
        BookshelfEntry(
            date: Date(),
            bookshelf: WidgetBookshelf(
                id: "placeholder",
                name: "My Bookshelf",
                books: []
            )
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (BookshelfEntry) -> Void) {
        let widgetData = SharedStorage.loadWidgetData()
        let entry = BookshelfEntry(
            date: Date(),
            bookshelf: widgetData?.bookshelf
        )
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BookshelfEntry>) -> Void) {
        let widgetData = SharedStorage.loadWidgetData()
        let entry = BookshelfEntry(
            date: Date(),
            bookshelf: widgetData?.bookshelf
        )
        // Refresh every 30 minutes
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }
}

// MARK: - Timeline Entry

struct BookshelfEntry: TimelineEntry {
    let date: Date
    let bookshelf: WidgetBookshelf?
}

// MARK: - Book Spine View

struct BookSpineView: View {
    let book: WidgetBook
    let width: CGFloat
    let height: CGFloat

    var body: some View {
        if let urlString = book.image_url,
           let url = URL(string: urlString) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: width, height: height)
                        .clipShape(RoundedRectangle(cornerRadius: 3))
                case .failure:
                    spineColorFallback
                default:
                    spineColorFallback
                }
            }
        } else {
            spineColorFallback
        }
    }

    private var spineColorFallback: some View {
        RoundedRectangle(cornerRadius: 3)
            .fill(Color(hue: stableHue(for: book.title), saturation: 0.5, brightness: 0.7))
            .frame(width: width, height: height)
            .overlay(
                Text(String(book.title.prefix(1)))
                    .font(.system(size: width * 0.5, weight: .bold))
                    .foregroundColor(.white)
                    .rotationEffect(.degrees(-90))
            )
    }

    private func stableHue(for title: String) -> Double {
        let hash = title.unicodeScalars.reduce(0) { $0 + Int($1.value) }
        return Double(hash % 360) / 360.0
    }
}

// MARK: - Widget View

struct BookshelfWidgetView: View {
    let entry: BookshelfEntry
    @Environment(\.widgetFamily) var widgetFamily

    private var maxBooks: Int {
        switch widgetFamily {
        case .systemSmall: return 4
        case .systemMedium: return 8
        default: return 12
        }
    }

    private var spineWidth: CGFloat {
        switch widgetFamily {
        case .systemSmall: return 32
        case .systemMedium: return 36
        default: return 40
        }
    }

    private var spineHeight: CGFloat {
        spineWidth * 1.5
    }

    var body: some View {
        if let bookshelf = entry.bookshelf {
            let books = Array(bookshelf.books.prefix(maxBooks))
            VStack(alignment: .leading, spacing: 8) {
                Text(bookshelf.name)
                    .font(.system(size: 14, weight: .bold))
                    .lineLimit(1)

                HStack(alignment: .bottom, spacing: 4) {
                    ForEach(books) { book in
                        BookSpineView(
                            book: book,
                            width: spineWidth,
                            height: spineHeight
                        )
                    }
                    Spacer(minLength: 0)
                }
            }
            .padding(12)
            .widgetURL(URL(string: "virtuallibrary://bookshelf/\(bookshelf.id)"))
        } else {
            VStack {
                Text("Long-press to choose a shelf")
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(12)
        }
    }
}

// MARK: - Widget Definition

struct BookshelfWidget: Widget {
    let kind = "BookshelfWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: BookshelfTimelineProvider()) { entry in
            BookshelfWidgetView(entry: entry)
                .containerBackground(for: .widget) { Color(.systemBackground) }
        }
        .configurationDisplayName("My Bookshelf")
        .description("Show one shelf from your library.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

// MARK: - Widget Bundle

@main
struct BookshelfWidgetBundle: WidgetBundle {
    var body: some Widget {
        BookshelfWidget()
    }
}

// MARK: - Previews

#Preview(as: .systemMedium) {
    BookshelfWidget()
} timeline: {
    BookshelfEntry(
        date: Date(),
        bookshelf: WidgetBookshelf(
            id: "preview",
            name: "Favorites",
            books: [
                WidgetBook(id: "1", title: "Dune", author: "Frank Herbert", image_url: nil),
                WidgetBook(id: "2", title: "1984", author: "George Orwell", image_url: nil),
                WidgetBook(id: "3", title: "Neuromancer", author: "William Gibson", image_url: nil),
            ]
        )
    )
}
