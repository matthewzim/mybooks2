import Foundation
import WidgetKit

@objc(VirtualLibraryWidgetBridge)
class VirtualLibraryWidgetBridge: NSObject {
    @objc
    static func requiresMainQueueSetup() -> Bool {
        false
    }

    @objc(updateWidgetData:)
    func updateWidgetData(_ payload: String) {
        guard
            let data = payload.data(using: .utf8),
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let appGroup = object["appGroup"] as? String,
            let defaults = UserDefaults(suiteName: appGroup)
        else {
            return
        }

        defaults.set(data, forKey: "widget.snapshot.payload")
        WidgetCenter.shared.reloadAllTimelines()
    }

    @objc(setSelectedShelf:)
    func setSelectedShelf(_ shelfId: String) {
        let appGroup = "group.com.virtualibrary.mybooks"
        guard let defaults = UserDefaults(suiteName: appGroup) else { return }

        guard
            let data = defaults.data(forKey: "widget.snapshot.payload"),
            var object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return }

        object["selectedShelfId"] = shelfId
        let updatedData = try? JSONSerialization.data(withJSONObject: object)
        defaults.set(updatedData, forKey: "widget.snapshot.payload")
        WidgetCenter.shared.reloadAllTimelines()
    }

    @objc
    func reloadTimelines() {
        WidgetCenter.shared.reloadAllTimelines()
    }
}
