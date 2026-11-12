import Foundation

struct SavedTracker: Codable, Identifiable, Equatable {
    var id: String { serial }
    let serial: String
    var peripheralID: UUID
    var name: String
    var symbol: String
    var firmware: String?
    var battery: Int?
    var batteryReadAt: Date?
    var connectedAt: Date

    static let symbols = ["bag.fill", "bicycle", "key.fill", "suitcase.fill", "pawprint.fill", "backpack.fill"]
    var valid: Bool {
        guard CityTagProtocol.decode(Data(serial.utf8),for:.serial) != nil,
              !name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty, name.count <= 60,
              Self.symbols.contains(symbol), battery.map({(0...100).contains($0)}) ?? true,
              firmware.map({$0.range(of:"^[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}$",options:.regularExpression) != nil}) ?? true,
              connectedAt.timeIntervalSince1970.isFinite, connectedAt.timeIntervalSince1970 >= 1_577_836_800,
              battery == nil || batteryReadAt != nil else { return false }
        return batteryReadAt.map {$0.timeIntervalSince1970.isFinite && $0.timeIntervalSince1970 >= 1_577_836_800} ?? true
    }
}

// Local convenience record only. This is not cloud ownership, activation or a location history.
final class SavedTrackerStore {
    static let key = "nl.narvie.mytag.native.savedTrackers.v1"
    private let defaults: UserDefaults
    struct Envelope: Codable { let version: Int; let trackers: [SavedTracker] }
    init(defaults: UserDefaults = .standard) { self.defaults = defaults }
    func load() -> [SavedTracker] {
        guard let data = defaults.data(forKey:Self.key),
              let value = try? JSONDecoder().decode(Envelope.self,from:data), value.version == 1,
              value.trackers.count <= 100, value.trackers.allSatisfy(\.valid),
              Set(value.trackers.map(\.serial)).count == value.trackers.count else { return [] }
        return value.trackers
    }
    @discardableResult func save(_ trackers: [SavedTracker]) -> Bool {
        guard trackers.count <= 100, trackers.allSatisfy(\.valid),
              Set(trackers.map(\.serial)).count == trackers.count,
              let data = try? JSONEncoder().encode(Envelope(version:1,trackers:trackers)) else { return false }
        defaults.set(data,forKey:Self.key)
        return true
    }
}

enum TrackerIdentity {
    // A remembered iOS Bluetooth UUID is a candidate, never sufficient proof of identity.
    static func matches(expected: String?, read serial: String) -> Bool {
        CityTagProtocol.decode(Data(serial.utf8),for:.serial) != nil && (expected == nil || expected == serial)
    }
    static func canOperate(ready: Bool, busy: Bool, serial: String?, expected: String?) -> Bool {
        guard ready, !busy, let serial else { return false }
        return matches(expected:expected,read:serial)
    }
}
