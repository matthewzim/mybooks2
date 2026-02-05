import SwiftUI
import WidgetKit

struct BookshelfTimelineProvider: AppIntentTimelineProvider {
    typealias Intent = BookshelfSelectionIntent
    typealias Entry = BookshelfWidgetEntry

    func placeholder(in context: Context) -> BookshelfWidgetEntry {
        BookshelfWidgetEntry(date: Date(), shelf: WidgetDataStore.loadSnapshot().shelves.first, family: context.family)
    }

    func snapshot(for configuration: BookshelfSelectionIntent, in context: Context) async -> BookshelfWidgetEntry {
        let shelf = WidgetDataStore.shelf(for: configuration.shelf?.id)
        return BookshelfWidgetEntry(date: Date(), shelf: shelf, family: context.family)
    }

    func timeline(for configuration: BookshelfSelectionIntent, in context: Context) async -> Timeline<BookshelfWidgetEntry> {
        let entry = BookshelfWidgetEntry(
            date: Date(),
            shelf: WidgetDataStore.shelf(for: configuration.shelf?.id),
            family: context.family
        )

        return Timeline(entries: [entry], policy: .never)
    }
}

struct BookshelfWidgetEntryView: View {
    var entry: BookshelfTimelineProvider.Entry

    var body: some View {
        if let shelf = entry.shelf {
            VStack(alignment: .leading, spacing: 8) {
                Text(shelf.name)
                    .font(.headline)
                    .lineLimit(1)

                GeometryReader { proxy in
                    let metrics = SpineLayoutMetrics(family: entry.family, size: proxy.size, count: max(shelf.books.count, 1))
                    HStack(alignment: .bottom, spacing: metrics.spacing) {
                        ForEach(shelf.books.prefix(metrics.maxCount)) { book in
                            AsyncImage(url: URL(string: book.image_url ?? "")) { phase in
                                switch phase {
                                case .success(let image):
                                    image
                                        .resizable()
                                        .scaledToFit()
                                default:
                                    RoundedRectangle(cornerRadius: 3)
                                        .fill(.quaternary)
                                }
                            }
                            .frame(width: metrics.spineWidth, height: metrics.spineHeight)
                            .clipShape(RoundedRectangle(cornerRadius: 3))
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
            .padding(12)
            .widgetURL(URL(string: "virtuallibrary://bookshelf?id=\(shelf.id)"))
        } else {
            Text("Long-press to choose a shelf")
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .padding()
        }
    }
}

private struct SpineLayoutMetrics {
    let spineWidth: CGFloat
    let spineHeight: CGFloat
    let spacing: CGFloat
    let maxCount: Int

    init(family: WidgetFamily, size: CGSize, count: Int) {
        switch family {
        case .systemSmall:
            maxCount = min(count, 4)
            spacing = 4
        case .systemMedium:
            maxCount = min(count, 8)
            spacing = 4
        default:
            maxCount = min(count, 12)
            spacing = 5
        }

        let availableWidth = max(size.width - (CGFloat(maxCount - 1) * spacing), 1)
        spineWidth = availableWidth / CGFloat(maxCount)
        spineHeight = max(size.height - 8, 1)
    }
}

struct BookshelfWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "BookshelfWidget", intent: BookshelfSelectionIntent.self, provider: BookshelfTimelineProvider()) { entry in
            BookshelfWidgetEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("My Bookshelf")
        .description("Show one shelf from your library.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
