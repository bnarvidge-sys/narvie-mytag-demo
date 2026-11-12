import SwiftUI
import WebKit

@main struct NarvieMyTagApp: App {
    var body: some Scene { WindowGroup { RootView() } }
}
struct RootView: View {
    var body: some View {
        TabView {
            NarvieWebView().tabItem { Label("Mijn tracker",systemImage:"map") }
            BluetoothTestView().tabItem { Label("Bluetooth-test",systemImage:"antenna.radiowaves.left.and.right") }
        }.tint(Color(red:0.09,green:0.24,blue:0.21))
    }
}
struct NarvieWebView: UIViewRepresentable {
    func makeUIView(context:Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        let view = WKWebView(frame:.zero,configuration:config)
        view.navigationDelegate = context.coordinator
        view.load(URLRequest(url:URL(string:"https://narvie-mytag-demo.onrender.com/mytag/#echte-tracker")!))
        return view
    }
    func updateUIView(_ uiView:WKWebView,context:Context) {}
    func makeCoordinator() -> Coordinator { Coordinator() }
    class Coordinator:NSObject,WKNavigationDelegate {
        func webView(_ webView:WKWebView,decidePolicyFor action:WKNavigationAction,decisionHandler:@escaping (WKNavigationActionPolicy)->Void) {
            guard let url = action.request.url else { decisionHandler(.cancel); return }
            if url.scheme == "https" && url.host == "narvie-mytag-demo.onrender.com" { decisionHandler(.allow); return }
            if action.navigationType == .linkActivated && ["https","mailto"].contains(url.scheme ?? "") { UIApplication.shared.open(url) }
            decisionHandler(.cancel)
        }
    }
}
struct BluetoothTestView: View {
    @StateObject private var ble = TrackerBluetooth()
    @State private var ownSample = false
    @Environment(\.scenePhase) var phase
    private let green = Color(red:0.09,green:0.24,blue:0.21)
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Je eigen tracker, dichtbij.").font(.title2.bold()).foregroundStyle(green)
                    Text("Native sampletest · 0.4.1").font(.caption)
                    Text("Alleen echte Bluetooth-antwoorden. Dit verbindt lokaal; het activeert of koppelt geen tracker aan een account. Laat de MyTag-koppeling staan.")
                    Toggle("Ik test uitsluitend mijn eigen sample",isOn:$ownSample).disabled(ble.ready || ble.connecting)
                }
                Section("Verbinding") {
                    Text(ble.status).accessibilityIdentifier("ble-status")
                    if !ble.ready && !ble.connecting {
                        Button(ble.scanning ? "Stop zoeken" : "Zoek mijn sample") { if ble.scanning { ble.stopScan() } else { ble.scan() } }.disabled(!ownSample)
                        ForEach(ble.devices) { device in
                            Button { ble.connect(device) } label: {
                                VStack(alignment:.leading) {
                                    Text(device.name)
                                    Text("\(device.id.uuidString.suffix(8)) · signaal \(device.rssi) dBm").font(.caption).foregroundStyle(.secondary)
                                }
                            }.disabled(!ownSample)
                        }
                    }
                    if ble.ready || ble.connecting { Button("Verbinding sluiten") { ble.disconnect() } }
                    Text("De naam of het signaal bewijst geen eigendom. De leverancier bevestigt dit profiel voor de dual-network-sample; werking op jouw iPhone moet nog worden getest.").font(.caption).foregroundStyle(.secondary)
                }
                Section("Identiteit uitlezen") {
                    LabeledContent("Serienummer",value:ble.serial ?? "Nog niet gelezen")
                    LabeledContent("Firmware",value:ble.firmware ?? "Nog niet gelezen")
                    Button("Lees serienummer") { ble.send(.serial) }.disabled(!ble.ready || ble.busy)
                    Button("Lees firmware") { ble.send(.firmware) }.disabled(!ble.ready || ble.busy)
                    Text("Een gelezen SN wordt niet automatisch naar een server gestuurd of aan het testtoken toegewezen.").font(.caption).foregroundStyle(.secondary)
                }
                Section("Batterij en geluid") {
                    LabeledContent("Batterij",value:ble.battery.map { "\($0)% · Bluetooth" } ?? "Onbekend")
                    Button("Lees batterij") { ble.send(.batteryStart) }.disabled(!ble.ready || ble.busy || ble.serial == nil)
                    Button("Laat mijn sample drie keer piepen") { ble.send(.ring) }.disabled(!ble.ready || ble.busy || ble.serial == nil)
                    Text("De batterij wordt twee seconden na de bevestigde start uitgelezen. Een bevestiging van de piepopdracht bewijst niet dat je het geluid daadwerkelijk hoort.").font(.caption).foregroundStyle(.secondary)
                }
                Section("Testgrenzen") {
                    Text("De leverancier bevestigt losse commandobytes zonder authenticatie voor de dual-network-sample. Er worden geen reset-, ontkoppel-, firmware- of sleutelwijzigingen verstuurd.")
                    Text("Scannen stopt na 12 seconden. De tracker verbreekt na één minuut inactiviteit; de app sluit ook de verbinding zodra hij naar de achtergrond gaat. Geen achtergrondtracking of GPS via deze Bluetooth-test.")
                }.font(.footnote)
            }.navigationTitle("Narvie Trackers").listStyle(.insetGrouped)
                .onChange(of:phase) { _, next in if next != .active { ble.suspend() } }
        }
    }
}
