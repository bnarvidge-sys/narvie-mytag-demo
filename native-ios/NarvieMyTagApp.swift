import SwiftUI
import WebKit

private let narvieGreen = Color(red:0.09,green:0.24,blue:0.21)
private let narvieCream = Color(red:0.97,green:0.97,blue:0.94)

@main struct NarvieMyTagApp: App {
    var body: some Scene { WindowGroup { RootView() } }
}
struct RootView: View {
    @StateObject private var ble = TrackerBluetooth()
    @Environment(\.scenePhase) private var phase
    var body: some View {
        TabView {
            TrackerHome(ble:ble).tabItem { Label("Mijn trackers",systemImage:"tag.fill") }
            NavigationStack { NarvieWebView().navigationTitle("Locatie op afstand").navigationBarTitleDisplayMode(.inline) }
                .tabItem { Label("Locatie",systemImage:"map") }
            TrackerHelp().tabItem { Label("Hulp",systemImage:"questionmark.circle") }
        }.tint(narvieGreen)
        .onChange(of:phase) { _, next in if next != .active { ble.suspend() } }
    }
}
struct TrackerHome: View {
    @ObservedObject var ble: TrackerBluetooth
    @State private var adding = false
    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment:.leading,spacing:10) {
                        Text("Dicht bij wat telt.").font(.largeTitle.bold()).foregroundStyle(narvieGreen)
                        Text("Jouw trackers, op jouw manier.").foregroundStyle(.secondary)
                        Label("Persoonlijke testversie · 0.5.0",systemImage:"sparkle").font(.caption).foregroundStyle(narvieGreen)
                    }.padding(.vertical,12)
                }.listRowBackground(Color.clear).listRowSeparator(.hidden)
                if ble.savedTrackers.isEmpty {
                    Section {
                        VStack(spacing:18) {
                            Image(systemName:"tag.circle.fill").font(.system(size:64)).foregroundStyle(narvieGreen)
                            Text("Geef je tracker een plek.").font(.title2.bold())
                            Text("Voeg jouw eigen tracker één keer toe. Daarna herken je hem aan zijn naam en kun je direct opnieuw verbinden.")
                                .foregroundStyle(.secondary).multilineTextAlignment(.center)
                            Button("Mijn tracker toevoegen",systemImage:"plus") { adding = true }
                                .buttonStyle(.borderedProminent).controlSize(.large)
                        }.frame(maxWidth:.infinity).padding(.vertical,24)
                    }
                } else {
                    Section("Mijn trackers") {
                        ForEach(ble.savedTrackers) { tracker in
                            NavigationLink { TrackerDetail(serial:tracker.serial,ble:ble) } label: {
                                HStack(spacing:15) {
                                    Image(systemName:tracker.symbol).font(.title2).foregroundStyle(narvieGreen)
                                        .frame(width:48,height:52).background(narvieCream,in:RoundedRectangle(cornerRadius:16))
                                    VStack(alignment:.leading,spacing:5) {
                                        Text(tracker.name).font(.headline)
                                        Text(ble.ready && ble.serial == tracker.serial ? "Verbonden via Bluetooth" : "Niet verbonden")
                                            .font(.caption).foregroundStyle(.secondary)
                                        if let battery = tracker.battery {
                                            Text("\(battery)% · laatst uitgelezen").font(.caption).foregroundStyle(.secondary)
                                        }
                                    }
                                }.padding(.vertical,7)
                            }
                        }
                    }
                    Button("Tracker toevoegen",systemImage:"plus") { adding = true }
                }
                Section {
                    Label("Locatie op afstand wordt nog aangesloten.",systemImage:"map")
                        .font(.subheadline).foregroundStyle(.secondary)
                    Text("De lokale bediening werkt via Bluetooth. Een Bluetooth-verbinding is geen locatie op de kaart.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }.scrollContentBackground(.hidden).background(narvieCream)
                .navigationTitle("Narvie Trackers").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement:.topBarTrailing) { Button("Toevoegen",systemImage:"plus") { adding = true } } }
                .sheet(isPresented:$adding) { AddTracker(ble:ble) }
        }
    }
}
struct TrackerDetail: View {
    let serial: String
    @ObservedObject var ble: TrackerBluetooth
    @State private var editing = false
    @State private var forgetting = false
    @Environment(\.dismiss) private var dismiss
    private var tracker: SavedTracker? { ble.saved(serial) }
    private var connected: Bool { ble.ready && ble.serial == serial }
    private var operating: Bool { connected && ble.canOperate }
    var body: some View {
        if let tracker {
            List {
                Section {
                    VStack(spacing:12) {
                        Image(systemName:tracker.symbol).font(.system(size:48)).foregroundStyle(narvieGreen)
                            .frame(width:96,height:96).background(narvieCream,in:RoundedRectangle(cornerRadius:28))
                        Text(tracker.name).font(.largeTitle.bold()).multilineTextAlignment(.center)
                        Label(connected ? "Verbonden" : "Niet verbonden",systemImage:connected ? "checkmark.circle.fill" : "circle.dotted")
                            .font(.subheadline).foregroundStyle(connected ? narvieGreen : .secondary)
                    }.frame(maxWidth:.infinity).padding(.vertical,18)
                }
                Section("Dichtbij bedienen") {
                    if connected {
                        Button { ble.send(.ring) } label: { Label("Laat mijn tracker piepen",systemImage:"speaker.wave.2.fill").padding(.vertical,8) }
                            .disabled(!operating)
                        Button("Batterij vernieuwen",systemImage:"arrow.clockwise") { ble.send(.batteryStart) }.disabled(!operating)
                        Button("Verbinding sluiten",systemImage:"xmark.circle") { ble.disconnect() }
                    } else {
                        Button { ble.reconnect(tracker) } label: {
                            Label(ble.connecting && ble.expectedSerial == serial ? "Verbinden…" : "Opnieuw verbinden",systemImage:"antenna.radiowaves.left.and.right")
                                .padding(.vertical,8)
                        }.disabled(ble.connecting || ble.busy || ble.scanning)
                    }
                    if ble.busy || ble.connecting { ProgressView("Even geduld…") }
                    Text(ble.status).font(.footnote).foregroundStyle(.secondary).accessibilityIdentifier("ble-status")
                }
                Section("Batterij") {
                    HStack {
                        Image(systemName:"battery.100percent").foregroundStyle(narvieGreen)
                        Text(tracker.battery.map { "\($0)%" } ?? "Nog niet uitgelezen").font(.title2.bold())
                        Spacer()
                        Text(connected && ble.batteryReadAt != nil ? "Bluetooth" : "Laatste uitlezing").font(.caption).foregroundStyle(.secondary)
                    }
                    if let time = tracker.batteryReadAt { Text("Uitgelezen: \(time.formatted(date:.abbreviated,time:.standard))").font(.caption).foregroundStyle(.secondary) }
                    Text("Dit is een gemeten batterijwaarde, geen live locatie. Na verbreken blijft de laatste uitlezing met dit tijdstip staan.").font(.caption).foregroundStyle(.secondary)
                }
                Section("Locatie") {
                    Label("Nog geen bevestigde netwerkwaarneming",systemImage:"map").foregroundStyle(.secondary)
                    Text("De locatiekoppeling wordt apart getest via het tabblad Locatie. Alleen de door de leverancier vrijgegeven testtracker is daar beschikbaar.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Section("Trackergegevens") {
                    LabeledContent("Serienummer",value:tracker.serial).textSelection(.enabled)
                    LabeledContent("Firmware",value:tracker.firmware ?? "Onbekend")
                    LabeledContent("Laatst via Bluetooth gelezen",value:tracker.connectedAt.formatted(date:.abbreviated,time:.shortened))
                    Text("Opnieuw verbinden controleert eerst het serienummer. Een ander apparaat wordt niet bediend.").font(.caption).foregroundStyle(.secondary)
                }
                Section {
                    Button("Naam en pictogram wijzigen",systemImage:"pencil") { editing = true }
                    Button("Verwijder uit deze Narvie-app",role:.destructive) { forgetting = true }
                } footer: { Text("Lokaal verwijderen ontkoppelt niets in MyTag en reset de tracker niet.") }
            }.scrollContentBackground(.hidden).background(narvieCream)
                .navigationTitle(tracker.name).navigationBarTitleDisplayMode(.inline)
                .sheet(isPresented:$editing) { TrackerEditor(tracker:tracker) { name,symbol in ble.rename(serial,name:name,symbol:symbol) } }
                .confirmationDialog("Deze tracker uit Narvie verwijderen?",isPresented:$forgetting,titleVisibility:.visible) {
                    Button("Verwijder lokaal",role:.destructive) { ble.forget(serial); dismiss() }
                } message: { Text("Alleen de naam en bewaarde uitlezingen op deze iPhone worden verwijderd. De MyTag-koppeling blijft staan.") }
        }
    }
}
struct AddTracker: View {
    @ObservedObject var ble: TrackerBluetooth
    @Environment(\.dismiss) private var dismiss
    @State private var own = false
    @State private var name = "Mijn tracker"
    @State private var symbol = "bag.fill"
    @State private var saved = false
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Voeg jouw eigen tracker toe.").font(.title2.bold()).foregroundStyle(narvieGreen)
                    Text("Laat je tracker gekoppeld in MyTag. Sluit de MyTag-app tijdens het verbinden. Houd je eigen tracker dichtbij; leg andere trackers verder weg.")
                    Toggle("Dit is mijn eigen tracker",isOn:$own).disabled(ble.ready || ble.connecting)
                }
                Section("1. Zoeken en herkennen") {
                    Text(ble.status).font(.subheadline)
                    if ble.connecting || ble.busy { ProgressView("Tracker uitlezen…") }
                    if !ble.ready && !ble.connecting {
                        Button(ble.scanning ? "Stop zoeken" : "Zoek mijn tracker",systemImage:ble.scanning ? "stop.circle" : "magnifyingglass") {
                            if ble.scanning { ble.stopScan() } else { ble.scan() }
                        }.disabled(!own)
                        ForEach(ble.devices.sorted {$0.rssi > $1.rssi}) { device in
                            Button { ble.connect(device) } label: {
                                VStack(alignment:.leading,spacing:4) {
                                    Text(device.name).font(.headline)
                                    Text("\(device.id.uuidString.suffix(8)) · \(device.rssi) dBm").font(.caption).foregroundStyle(.secondary)
                                }
                            }.disabled(!own)
                        }
                        Text("Een naam of sterk signaal bewijst niet welke tracker het is. Controleer het uitgelezen serienummer voordat je hem bewaart.").font(.caption).foregroundStyle(.secondary)
                    }
                    if let serial = ble.serial {
                        LabeledContent("Serienummer",value:serial).textSelection(.enabled)
                        LabeledContent("Firmware",value:ble.firmware ?? "Uitlezen…")
                        LabeledContent("Batterij",value:ble.battery.map { "\($0)%" } ?? "Uitlezen…")
                    }
                    if ble.ready { Button("Andere tracker kiezen") { ble.disconnect() } }
                }
                if ble.serial != nil {
                    Section {
                        TextField("Naam, bijvoorbeeld Mijn tas",text:$name).textInputAutocapitalization(.sentences)
                        SymbolPicker(symbol:$symbol)
                        Button("Bewaar mijn tracker") {
                            if ble.remember(name:name,symbol:symbol) { saved = true; dismiss() }
                        }.disabled(!ble.canOperate || name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty)
                    } header: { Text("2. Maak hem herkenbaar") } footer: { Text("Je bewaart hem op deze iPhone. Dit maakt nog geen Narvie-cloudaccount en verandert de MyTag-koppeling niet.") }
                }
            }.navigationTitle("Tracker toevoegen").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement:.cancellationAction) { Button("Sluiten") { dismiss() } } }
                .onAppear { ble.disconnect() }
                .onDisappear { if !saved { ble.disconnect() } }
        }
    }
}
struct SymbolPicker: View {
    @Binding var symbol: String
    var body: some View {
        HStack {
            ForEach(SavedTracker.symbols,id:\.self) { item in
                Button { symbol = item } label: {
                    Image(systemName:item).font(.title3).frame(maxWidth:.infinity,minHeight:44)
                        .foregroundStyle(symbol == item ? .white : narvieGreen)
                        .background(symbol == item ? narvieGreen : narvieCream,in:RoundedRectangle(cornerRadius:12))
                }.buttonStyle(.plain).accessibilityLabel(["bag.fill":"Tas","bicycle":"Fiets","key.fill":"Sleutels","suitcase.fill":"Koffer","pawprint.fill":"Huisdier","backpack.fill":"Rugzak"][item] ?? item)
                    .accessibilityAddTraits(symbol == item ? .isSelected : [])
            }
        }
    }
}
struct TrackerEditor: View {
    let tracker: SavedTracker
    let save: (String,String)->Void
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var symbol: String
    init(tracker:SavedTracker,save:@escaping(String,String)->Void) {
        self.tracker = tracker; self.save = save
        _name = State(initialValue:tracker.name); _symbol = State(initialValue:tracker.symbol)
    }
    var body: some View {
        NavigationStack {
            Form { TextField("Trackernaam",text:$name); SymbolPicker(symbol:$symbol) }
                .navigationTitle("Jouw tracker").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement:.cancellationAction) { Button("Annuleren") { dismiss() } }
                    ToolbarItem(placement:.confirmationAction) { Button("Bewaren") { save(name,symbol); dismiss() }.disabled(name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty) }
                }
        }
    }
}
struct TrackerHelp: View {
    var body: some View {
        NavigationStack {
            List {
                Section("Dichtbij zoeken") {
                    Text("Open Mijn trackers, kies je tracker en tik Opnieuw verbinden. Narvie controleert het serienummer en leest de batterij opnieuw. Tik daarna Laat mijn tracker piepen.")
                    Text("De verbinding sluit als de app naar de achtergrond gaat. Deze firmware verbreekt ook na één minuut inactiviteit. Dat verwijdert je bewaarde tracker niet.")
                }
                Section("Naam en batterij") {
                    Text("Naam en pictogram worden alleen op deze iPhone bewaard. Je kunt meerdere eigen trackers lokaal bewaren. Elke batterijwaarde krijgt het tijdstip van de echte uitlezing; een oude waarde is geen live meting.")
                }
                Section("Locatie op afstand") {
                    Text("Deze persoonlijke versie is nog geen volledige vervanging van MyTag. De serverkoppeling wacht op bevestiging van het antwoordformaat. Er wordt geen voorbeeldlocatie op de kaart gezet.")
                    Text("De locatieproef gebruikt een apart Narvie-testwachtwoord. Voor lokaal Bluetooth is geen wachtwoord nodig. Houd bestaande MyTag-koppelingen voorlopig intact.")
                }
                Section("Toestemming en privacy") {
                    Text("Zoeken start pas als je zelf op de zoekknop tikt. Narvie vraagt dan Bluetooth-toestemming. Locatie, meldingen en achtergrondtracking worden in deze versie niet aangezet.")
                    Text("Deze lokale trackerregistratie bewijst geen cloud-eigendom. Er worden geen reset-, ontkoppel-, firmware- of sleutelwijzigingen verstuurd.")
                }
                Section("Hulp nodig?") {
                    Link("contact@narvie-tracker.nl",destination:URL(string:"mailto:contact@narvie-tracker.nl")!)
                    Text("Narvie Trackers · iPhone 0.5.0\nEigen MyTag-project · los van Narvie 4G").font(.caption).foregroundStyle(.secondary)
                }
            }.navigationTitle("Hoe kunnen we helpen?").navigationBarTitleDisplayMode(.inline)
        }
    }
}
struct NarvieWebView: UIViewRepresentable {
    func makeUIView(context:Context) -> WKWebView {
        let config = WKWebViewConfiguration(); config.websiteDataStore = .nonPersistent()
        let view = WKWebView(frame:.zero,configuration:config); view.navigationDelegate = context.coordinator
        view.load(URLRequest(url:URL(string:"https://narvie-mytag-demo.onrender.com/mytag/#echte-tracker")!))
        return view
    }
    func updateUIView(_ uiView:WKWebView,context:Context) {}
    func makeCoordinator() -> Coordinator { Coordinator() }
    class Coordinator:NSObject,WKNavigationDelegate {
        func webView(_ webView:WKWebView,decidePolicyFor action:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void) {
            guard let url = action.request.url else { decisionHandler(.cancel); return }
            if url.scheme == "https" && url.host == "narvie-mytag-demo.onrender.com" { decisionHandler(.allow); return }
            if action.navigationType == .linkActivated && ["https","mailto"].contains(url.scheme ?? "") { UIApplication.shared.open(url) }
            decisionHandler(.cancel)
        }
    }
}
