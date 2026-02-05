import Foundation

enum WidgetDataStore {
    static let appGroup = "group.com.virtualibrary.mybooks"
    static let payloadKey = "widget.snapshot.payload"

    static func loadSnapshot() -> WidgetSnapshot {
        guard
            let defaults = UserDefaults(suiteName: appGroup),
            let data = defaults.data(forKey: payloadKey),
            let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
        else {
            return WidgetSnapshot(selectedShelfId: nil, shelves: [], lastUpdated: Date())
        }

        return snapshot
    }

    static func shelf(for shelfId: String?) -> WidgetShelf? {
        let snapshot = loadSnapshot()
        let activeId = shelfId ?? snapshot.selectedShelfId

        guard let activeId else { return snapshot.shelves.first }
        return snapshot.shelves.first(where: { $0.id == activeId }) ?? snapshot.shelves.first
    }
}
