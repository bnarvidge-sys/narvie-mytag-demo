import Foundation
import CoreBluetooth
import Combine

struct NearbyTag: Identifiable {
    let id: UUID
    let name: String
    var rssi: Int
}

// CoreBluetooth is explicitly created on .main; its delegate callbacks stay on that queue.
@MainActor final class TrackerBluetooth: NSObject, ObservableObject, @preconcurrency CBCentralManagerDelegate, @preconcurrency CBPeripheralDelegate {
    @Published var devices: [NearbyTag] = []
    @Published var scanning = false
    @Published var connecting = false
    @Published var ready = false
    @Published var busy = false
    @Published var serial: String?
    @Published var firmware: String?
    @Published var battery: Int?
    @Published var measurementStarted = false
    @Published var status = "Nog geen Bluetooth-verbinding."
    @Published var selectedName: String?
    @Published private(set) var savedTrackers: [SavedTracker] = []
    @Published private(set) var expectedSerial: String?
    @Published private(set) var batteryReadAt: Date?
    private let store = SavedTrackerStore()
    private var pendingReconnect: SavedTracker?
    private var central: CBCentralManager?
    private var peripherals: [UUID:CBPeripheral] = [:]
    private var active: CBPeripheral?
    private var writeCharacteristic: CBCharacteristic?
    private var notificationCharacteristic: CBCharacteristic?
    private var command: CityTagProtocol.Command?
    private var deadline: Task<Void,Never>?
    private var scanDeadline: Task<Void,Never>?
    private var batteryDelay: Task<Void,Never>?
    private var awaitingPower = false
    private var generation = UUID()

    override init() {
        super.init()
        savedTrackers = store.load()
    }
    var canOperate: Bool { TrackerIdentity.canOperate(ready:ready,busy:busy,serial:serial,expected:expectedSerial) }
    func saved(_ serial: String) -> SavedTracker? { savedTrackers.first {$0.serial == serial} }
    @discardableResult func remember(name: String, symbol: String) -> Bool {
        guard let serial, let active, ready, TrackerIdentity.matches(expected:expectedSerial,read:serial) else { return false }
        let cleanName = String(name.trimmingCharacters(in:.whitespacesAndNewlines).prefix(60))
        let tag = SavedTracker(serial:serial,peripheralID:active.identifier,name:cleanName,symbol:symbol,
            firmware:firmware,battery:battery,batteryReadAt:batteryReadAt,connectedAt:Date())
        guard tag.valid else { return false }
        var next = savedTrackers.filter {$0.serial != serial}; next.append(tag)
        guard store.save(next) else { status = "De tracker kon niet lokaal worden bewaard."; return false }
        savedTrackers = next; expectedSerial = serial
        return true
    }
    func rename(_ serial: String, name: String, symbol: String) {
        guard let i = savedTrackers.firstIndex(where:{$0.serial == serial}) else { return }
        var next = savedTrackers
        next[i].name = String(name.trimmingCharacters(in:.whitespacesAndNewlines).prefix(60)); next[i].symbol = symbol
        if store.save(next) { savedTrackers = next }
    }
    func forget(_ serial: String) {
        if self.serial == serial || expectedSerial == serial { disconnect() }
        let next = savedTrackers.filter {$0.serial != serial}
        if store.save(next) { savedTrackers = next }
    }
    private func updateRemembered() {
        guard let serial, let active, let i = savedTrackers.firstIndex(where:{$0.serial == serial}) else { return }
        var next = savedTrackers
        next[i].peripheralID = active.identifier; next[i].connectedAt = Date()
        if let firmware { next[i].firmware = firmware }
        if let battery, let batteryReadAt { next[i].battery = battery; next[i].batteryReadAt = batteryReadAt }
        if store.save(next) { savedTrackers = next }
    }
    func reconnect(_ tracker: SavedTracker) {
        guard !connecting, !busy else { return }
        disconnect(); expectedSerial = tracker.serial; pendingReconnect = tracker
        if central == nil { central = CBCentralManager(delegate:self,queue:.main) }
        else if central?.state == .poweredOn { beginReconnect() }
        else { status = "Zet Bluetooth aan om opnieuw te verbinden." }
    }
    private func beginReconnect() {
        guard let tracker = pendingReconnect else { return }
        pendingReconnect = nil
        guard let peripheral = central?.retrievePeripherals(withIdentifiers:[tracker.peripheralID]).first else {
            status = "Deze iPhone herkent het Bluetooth-adres niet meer. Voeg je eigen tracker opnieuw toe; het serienummer blijft de controle."; return
        }
        peripherals[peripheral.identifier] = peripheral
        connect(NearbyTag(id:peripheral.identifier,name:tracker.name,rssi:0),expected:tracker.serial)
    }

    func scan() {
        guard !connecting, !ready, !busy else { return }
        pendingReconnect = nil; expectedSerial = nil
        devices = []; peripherals = [:]
        if central == nil {
            awaitingPower = true
            central = CBCentralManager(delegate:self, queue:.main)
        } else if central?.state == .poweredOn { beginScan() }
        else { status = "Zet Bluetooth aan en controleer de toestemming bij Instellingen > Narvie Test." }
    }
    private func beginScan() {
        awaitingPower = false; scanning = true
        status = "Zoeken naar nabije MyTag-samples…"
        // Advertising service/name has not been documented. Do not assume service UUID is advertised.
        central?.scanForPeripherals(withServices:nil, options:[CBCentralManagerScanOptionAllowDuplicatesKey:false])
        scanDeadline?.cancel()
        scanDeadline = Task { [weak self] in
            try? await Task.sleep(for:.seconds(12))
            guard !Task.isCancelled else { return }
            self?.stopScan()
        }
    }
    func stopScan() {
        central?.stopScan(); scanning = false; scanDeadline?.cancel()
        if !ready && !connecting { status = devices.isEmpty ? "Geen tracker gevonden. Houd je eigen tracker dichtbij en probeer opnieuw. Niet resetten of uit MyTag verwijderen." : "Kies jouw eigen tracker. Narvie leest daarna het serienummer ter controle." }
    }
    func connect(_ device: NearbyTag, expected: String? = nil) {
        guard !ready, !connecting, let peripheral = peripherals[device.id], central?.state == .poweredOn else { return }
        stopScan(); clearValues(); selectedName = device.name; expectedSerial = expected
        active = peripheral; peripheral.delegate = self; connecting = true
        status = "Verbinden en Bluetooth-profiel controleren…"
        central?.connect(peripheral)
        armDeadline(seconds:15, message:"Verbinden duurde te lang. Er is geen tracker gekoppeld.")
    }
    func disconnect() {
        awaitingPower = false; pendingReconnect = nil
        stopScan(); deadline?.cancel(); batteryDelay?.cancel(); generation = UUID()
        if let active { central?.cancelPeripheralConnection(active) }
        active = nil; writeCharacteristic = nil; notificationCharacteristic = nil
        connecting = false; ready = false; busy = false; command = nil
        clearValues(); selectedName = nil; expectedSerial = nil
        status = "Niet verbonden. Bewaarde gegevens tonen de laatste uitlezing."
    }
    func suspend() { disconnect() }
    private func clearValues() { serial = nil; firmware = nil; battery = nil; batteryReadAt = nil; measurementStarted = false }
    private func fail(_ message: String) { disconnect(); status = message }
    private func armDeadline(seconds:Int, message:String) {
        deadline?.cancel(); let id = generation
        deadline = Task { [weak self] in
            try? await Task.sleep(for:.seconds(seconds))
            guard !Task.isCancelled, let self, self.generation == id else { return }
            // Close after timeout: ACKs lack command IDs, so a late response must not satisfy a later command.
            self.fail(message)
        }
    }
    func send(_ next: CityTagProtocol.Command) {
        if next != .serial && !canOperate { return }
        guard ready, !busy, let active, active.state == .connected,
              let writeCharacteristic, let notificationCharacteristic,
              notificationCharacteristic.isNotifying, active.canSendWriteWithoutResponse else {
            if ready && !busy { status = "Bluetooth is nog niet gereed voor een opdracht. Probeer opnieuw." }
            return
        }
        if next == .batteryRead && !measurementStarted { status = "Start eerst de batterijmeting."; return }
        busy = true; command = next; status = "Wachten op een echt antwoord van de tracker…"
        armDeadline(seconds:6, message:"Geen passend antwoord ontvangen. Verbinding gesloten om verwisselde antwoorden te voorkomen. Model, framing en firmware moeten nog worden gecontroleerd.")
        active.writeValue(Data([next.rawValue]), for:writeCharacteristic, type:.withoutResponse)
    }
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state == .unknown || central.state == .resetting { status = "Bluetooth wordt voorbereid…"; return }
        if central.state == .poweredOn, pendingReconnect != nil { beginReconnect(); return }
        if central.state == .poweredOn && awaitingPower { beginScan(); return }
        if central.state != .poweredOn {
            awaitingPower = false
            if active != nil { disconnect() }
            scanning = false
            switch central.state {
            case .unauthorized: status = "Bluetooth-toestemming ontbreekt. Zet die aan bij Instellingen > Narvie Test."
            case .unsupported: status = "Bluetooth wordt hier niet ondersteund. Gebruik een echte iPhone; de simulator kan geen tracker verbinden."
            case .poweredOff: status = "Bluetooth staat uit. Zet Bluetooth aan en zoek opnieuw."
            default: status = "Bluetooth wordt voorbereid. Zoek zo opnieuw."
            }
        }
    }
    func centralManager(_ central:CBCentralManager, didDiscover peripheral:CBPeripheral, advertisementData:[String:Any], rssi RSSI:NSNumber) {
        guard scanning else { return }
        let name = advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? peripheral.name ?? "Onbekend apparaat"
        let services = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? []
        guard name.uppercased().contains("MYTAG") || services.contains(CBUUID(string:CityTagProtocol.service)) else { return }
        peripherals[peripheral.identifier] = peripheral
        let item = NearbyTag(id:peripheral.identifier,name:name,rssi:RSSI.intValue)
        if let i = devices.firstIndex(where:{$0.id == item.id}) { devices[i] = item } else if devices.count < 30 { devices.append(item) }
    }
    func centralManager(_ central:CBCentralManager, didConnect peripheral:CBPeripheral) {
        guard peripheral === active else { return }
        peripheral.discoverServices([CBUUID(string:CityTagProtocol.service)])
    }
    func centralManager(_ central:CBCentralManager, didFailToConnect peripheral:CBPeripheral, error:Error?) {
        guard peripheral === active else { return }; fail("De tracker kon niet worden verbonden. De MyTag-koppeling is niet gewijzigd.")
    }
    func centralManager(_ central:CBCentralManager, didDisconnectPeripheral peripheral:CBPeripheral, error:Error?) {
        guard peripheral === active else { return }; fail("De Bluetooth-verbinding is verbroken. Deze firmware verbreekt na één minuut inactiviteit. Zoek je eigen tracker opnieuw.")
    }
    func peripheral(_ peripheral:CBPeripheral, didDiscoverServices error:Error?) {
        guard peripheral === active else { return }
        guard error == nil, let service = peripheral.services?.first(where:{$0.uuid == CBUUID(string:CityTagProtocol.service)}) else { fail("Deze tracker heeft niet het gedocumenteerde MyTag-profiel."); return }
        peripheral.discoverCharacteristics([CBUUID(string:CityTagProtocol.write),CBUUID(string:CityTagProtocol.notify)], for:service)
    }
    func peripheral(_ peripheral:CBPeripheral, didDiscoverCharacteristicsFor service:CBService, error:Error?) {
        guard peripheral === active else { return }
        guard error == nil,
              let write = service.characteristics?.first(where:{$0.uuid == CBUUID(string:CityTagProtocol.write)}),write.properties.contains(.writeWithoutResponse),
              let notify = service.characteristics?.first(where:{$0.uuid == CBUUID(string:CityTagProtocol.notify)}),notify.properties.contains(.notify) else {
            fail("Het schrijf-/notificatieprofiel komt niet overeen met de leverancierinformatie."); return
        }
        writeCharacteristic = write; notificationCharacteristic = notify
        peripheral.setNotifyValue(true,for:notify)
    }
    func peripheral(_ peripheral:CBPeripheral, didUpdateNotificationStateFor characteristic:CBCharacteristic, error:Error?) {
        guard peripheral === active, characteristic === notificationCharacteristic else { return }
        guard error == nil, characteristic.isNotifying else { fail("Ontvangen van Bluetooth-antwoorden kon niet worden gestart."); return }
        deadline?.cancel(); connecting = false; ready = true
        status = "Bluetooth-profiel gevonden. Serienummer uitlezen…"
        send(.serial)
    }
    func peripheral(_ peripheral:CBPeripheral, didUpdateValueFor characteristic:CBCharacteristic, error:Error?) {
        guard peripheral === active, characteristic === notificationCharacteristic, let command else { return }
        guard error == nil, let value = characteristic.value, let reply = CityTagProtocol.decode(value,for:command) else { return }
        deadline?.cancel(); busy = false; self.command = nil
        switch reply {
        case .serial(let sn):
            guard TrackerIdentity.matches(expected:expectedSerial,read:sn) else {
                fail("Het serienummer komt niet overeen met jouw bewaarde tracker. Er zijn geen batterij- of geluidsopdrachten verstuurd."); return
            }
            serial = sn; status = "Serienummer rechtstreeks via Bluetooth gelezen."
            updateRemembered()
            send(.firmware)
        case .firmware(let version):
            firmware = version; status = "Firmwareversie rechtstreeks gelezen."
            updateRemembered()
            if serial != nil && battery == nil { send(.batteryStart) }
        case .battery(let percent):
            battery = percent; batteryReadAt = Date(); measurementStarted = false
            updateRemembered(); status = "Verbonden. Batterij zojuist rechtstreeks uitgelezen."
        case .acknowledged:
            if command == .batteryStart {
                battery = nil; measurementStarted = true; busy = true
                status = "Batterijmeting gestart. Na twee seconden wordt het resultaat opgevraagd…"
                let id = generation
                batteryDelay?.cancel()
                batteryDelay = Task { [weak self] in
                    try? await Task.sleep(for:.milliseconds(CityTagProtocol.batteryDelayMilliseconds))
                    guard !Task.isCancelled, let self, self.generation == id, self.ready, self.measurementStarted else { return }
                    self.busy = false
                    self.send(.batteryRead)
                }
            }
            else { status = "Tracker bevestigt de piepopdracht. Controleer zelf of je drie piepjes hoort." }
        }
    }
}
