import Foundation

@main struct SavedTrackerChecks {
    static func main() {
        let suite = "narvie-unit-checks-" + UUID().uuidString
        let defaults = UserDefaults(suiteName:suite)!
        defer { defaults.removePersistentDomain(forName:suite) }
        defaults.set("keep-4g-value",forKey:"narvie4g")
        let store = SavedTrackerStore(defaults:defaults)
        let now = Date()
        let first = SavedTracker(serial:"SAMPLE000001",peripheralID:UUID(),name:"Mijn tas",symbol:"bag.fill",firmware:"0.9.19",battery:98,batteryReadAt:now,connectedAt:now)
        precondition(store.load().isEmpty)
        precondition(store.save([first]))
        precondition(SavedTrackerStore(defaults:defaults).load() == [first])
        var renamed = first; renamed.name = "Sleutels"; renamed.symbol = "key.fill"
        precondition(store.save([renamed]))
        precondition(store.load()[0].serial == first.serial && store.load()[0].name == "Sleutels")
        var broken = first; broken.battery = 101
        precondition(!store.save([broken]) && store.load() == [renamed])
        precondition(!store.save([first,first]) && store.load() == [renamed])
        broken = first; broken.batteryReadAt = nil
        precondition(!store.save([broken]))
        broken = first; broken.symbol = "unknown-symbol"
        precondition(!store.save([broken]))
        defaults.set(Data("not-json".utf8),forKey:SavedTrackerStore.key)
        precondition(store.load().isEmpty)
        precondition(defaults.string(forKey:"narvie4g") == "keep-4g-value")
        precondition(!TrackerIdentity.canOperate(ready:true,busy:false,serial:nil,expected:first.serial))
        precondition(!TrackerIdentity.canOperate(ready:true,busy:false,serial:"SAMPLE000002",expected:first.serial))
        precondition(!TrackerIdentity.canOperate(ready:false,busy:false,serial:first.serial,expected:first.serial))
        precondition(!TrackerIdentity.canOperate(ready:true,busy:true,serial:first.serial,expected:first.serial))
        precondition(TrackerIdentity.canOperate(ready:true,busy:false,serial:first.serial,expected:first.serial))
        precondition(!TrackerIdentity.matches(expected:nil,read:"AUTH-CODE"))
        precondition(store.save([]) && store.load().isEmpty)
        print("18 opslag-/identiteitscontroles geslaagd. Geen hardwaretest.")
    }
}
