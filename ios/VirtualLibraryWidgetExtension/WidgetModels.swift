import WidgetKit
import Foundation

struct WidgetSnapshot: Codable {
    let selectedShelfId: String?
    let shelves: [WidgetShelf]
    let lastUpdated: Date
}

struct WidgetShelf: Codable, Identifiable {
    let id: String
    let name: String
    let books: [WidgetBook]
}

struct WidgetBook: Codable, Identifiable {
    let id: String
    let title: String
    let author: String
    let image_url: String?
}

struct BookshelfWidgetEntry: TimelineEntry {
    let date: Date
    let shelf: WidgetShelf?
    let family: WidgetFamily
}
