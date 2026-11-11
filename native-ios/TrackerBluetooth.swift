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
    private var central: CBCentralManager?
    private var peripherals: [UUID:CBPeripheral] = [:]
    private var active: CBPeripheral?
    private var writeCharacteristic: CBCharacteristic?
    private var notificationCharacteristic: CBCharacteristic?
    private var command: CityTagProtocol.Command?
    private var deadline: Task<Void,Never>?
    private var scanDeadline: Task<Void,Never>?
    private var awaitingPower = false
    private var generation = UUID()

    func scan() {
        guard !connecting, !ready, !busy else { return }
        devices = []; peripherals = [:]
        if central == nil {
            awaitingPower = true
            central = CBCentralManager(delegate:self, queue:.main)
        } else if central?.state == .poweredOn { beginScan() }
        else { status = "Zet Bluetooth aan en controleer de toestemming bij Instellingen > Narvie Trackers." }
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
        if !ready && !connecting { status = devices.isEmpty ? "Geen MyTag gevonden. Houd je eigen sample dichtbij en probeer opnieuw. Niet resetten of uit MyTag verwijderen." : "Kies uitsluitend je eigen sample. Een Bluetooth-naam bewijst geen eigendom." }
    }
    func connect(_ device: NearbyTag) {
        guard !ready, !connecting, let peripheral = peripherals[device.id], central?.state == .poweredOn else { return }
        stopScan(); clearValues(); selectedName = device.name
        active = peripheral; peripheral.delegate = self; connecting = true
        status = "Verbinden en Bluetooth-profiel controleren…"
        central?.connect(peripheral)
        armDeadline(seconds:15, message:"Verbinden duurde te lang. Er is geen tracker gekoppeld.")
    }
    func disconnect() {
        stopScan(); deadline?.cancel(); generation = UUID()
        if let active { central?.cancelPeripheralConnection(active) }
        active = nil; writeCharacteristic = nil; notificationCharacteristic = nil
        connecting = false; ready = false; busy = false; command = nil
        clearValues(); selectedName = nil; status = "Bluetooth-verbinding gesloten. De MyTag-accountkoppeling is niet gewijzigd."
    }
    func suspend() { disconnect() }
    private func clearValues() { serial = nil; firmware = nil; battery = nil; measurementStarted = false }
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
        if central.state == .poweredOn && awaitingPower { beginScan(); return }
        if central.state != .poweredOn {
            awaitingPower = false
            if active != nil { disconnect() }
            scanning = false
            switch central.state {
            case .unauthorized: status = "Bluetooth-toestemming ontbreekt. Zet die aan bij Instellingen > Narvie Trackers."
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
        guard peripheral === active else { return }; fail("De Bluetooth-verbinding is verbroken. Zoek je eigen tracker opnieuw.")
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
        status = "Bluetooth-profiel gevonden. Lees nu het serienummer; dit activeert of bindt de tracker niet."
    }
    func peripheral(_ peripheral:CBPeripheral, didUpdateValueFor characteristic:CBCharacteristic, error:Error?) {
        guard peripheral === active, characteristic === notificationCharacteristic, let command else { return }
        guard error == nil, let value = characteristic.value, let reply = CityTagProtocol.decode(value,for:command) else { return }
        deadline?.cancel(); busy = false; self.command = nil
        switch reply {
        case .serial(let sn): serial = sn; status = "Serienummer rechtstreeks via Bluetooth gelezen. Toewijzing aan de server is hiermee nog niet bevestigd."
        case .firmware(let version): firmware = version; status = "Firmwareversie rechtstreeks gelezen."
        case .battery(let percent): battery = percent; measurementStarted = false; status = "Batterijpercentage rechtstreeks via Bluetooth gelezen."
        case .acknowledged:
            if command == .batteryStart { battery = nil; measurementStarted = true; status = "Start meting bevestigd. De meetduur is nog niet bekend; vraag het resultaat handmatig op." }
            else { status = "Tracker bevestigt de piepopdracht. Controleer zelf of je drie piepjes hoort." }
        }
    }
}
