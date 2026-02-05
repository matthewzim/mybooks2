import AppIntents

struct ShelfEntity: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Bookshelf"
    static var defaultQuery = ShelfEntityQuery()

    let id: String
    let name: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)")
    }
}

struct ShelfEntityQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [ShelfEntity] {
        let shelves = WidgetDataStore.loadSnapshot().shelves
        return shelves
            .filter { identifiers.contains($0.id) }
            .map { ShelfEntity(id: $0.id, name: $0.name) }
    }

    func suggestedEntities() async throws -> [ShelfEntity] {
        WidgetDataStore.loadSnapshot().shelves.map { ShelfEntity(id: $0.id, name: $0.name) }
    }
}

struct BookshelfSelectionIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Choose Shelf"
    static var description = IntentDescription("Select which bookshelf appears in the home screen widget.")

    @Parameter(title: "Bookshelf")
    var shelf: ShelfEntity?
}
