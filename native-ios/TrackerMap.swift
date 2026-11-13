import SwiftUI
import MapKit

struct TrackerMap: View {
    @ObservedObject var ble: TrackerBluetooth
    @ObservedObject var cloud: CloudLocation
    @State private var selected: String?
    @State private var adding = false
    @State private var signingIn = false
    @State private var camera: MapCameraPosition = .region(MKCoordinateRegion(center:CLLocationCoordinate2D(latitude:52.2,longitude:5.3),span:MKCoordinateSpan(latitudeDelta:3.4,longitudeDelta:3.4)))
    private var serial: String? { selected ?? ble.savedTrackers.first?.serial ?? cloud.tracker?.sn }
    private var saved: SavedTracker? { serial.flatMap { ble.saved($0) } }
    private var observation: CloudObservation? { cloud.observation(for:serial) }
    private var name: String { saved?.name ?? (serial == cloud.tracker?.sn ? cloud.tracker?.name : nil) ?? "Mijn tracker" }
    private var connected: Bool { ble.ready && ble.serial == serial }
    var body: some View {
        NavigationStack {
            GeometryReader { geometry in
                ZStack(alignment:.top) {
                    Map(position:$camera) {
                        if let observation {
                            Annotation(name,coordinate:CLLocationCoordinate2D(latitude:observation.latitude,longitude:observation.longitude)) {
                                Image(systemName:saved?.symbol ?? "tag.fill").font(.title2).foregroundStyle(.white)
                                    .padding(16).background(narvieGreen,in:Circle()).overlay(Circle().stroke(.white,lineWidth:4)).shadow(radius:5)
                                    .accessibilityLabel("Laatste netwerkwaarneming van \(name)")
                            }
                        }
                    }.mapStyle(.standard(elevation:.flat,pointsOfInterest:.excludingAll))
                        .accessibilityIdentifier("tracker-map")
                    if observation == nil {
                        Label("Nog geen locatie ontvangen",systemImage:"mappin.slash")
                            .font(.subheadline.weight(.medium)).padding(.horizontal,16).padding(.vertical,11)
                            .background(.regularMaterial,in:Capsule()).padding(.top,16).padding(.horizontal)
                    }
                }
                .safeAreaInset(edge:.bottom,spacing:0) {
                    ScrollView {
                        trackerCard.padding(20)
                    }.frame(maxHeight:geometry.size.height * 0.58)
                        .background(.regularMaterial,in:UnevenRoundedRectangle(topLeadingRadius:28,topTrailingRadius:28))
                }
            }
            .navigationTitle("Narvie Trackers").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement:.topBarLeading) {
                    if !ble.savedTrackers.isEmpty {
                        Menu {
                            ForEach(ble.savedTrackers) { tag in Button(tag.name,systemImage:tag.symbol) { selected = tag.serial } }
                            if let tag = cloud.tracker,let sn = tag.sn,!ble.savedTrackers.contains(where:{$0.serial == sn}) {
                                Button(tag.name,systemImage:"network") { selected = sn }
                            }
                        } label: { Image(systemName:"tag.fill").accessibilityLabel("Kies tracker") }
                    }
                }
                ToolbarItem(placement:.topBarTrailing) { Button("Tracker toevoegen",systemImage:"plus") { adding = true } }
            }
            .sheet(isPresented:$adding) { AddTracker(ble:ble) }
            .sheet(isPresented:$signingIn) { CloudSignIn(cloud:cloud) }
            .onChange(of:serial) { _,_ in focus() }
            .onChange(of:observation) { _,_ in focus() }
            .onChange(of:ble.savedTrackers) { _,tags in if let selected,!tags.contains(where:{$0.serial == selected}) { self.selected = nil } }
            .onAppear { focus() }
        }
    }
    private var trackerCard: some View {
        VStack(alignment:.leading,spacing:16) {
            HStack(spacing:14) {
                Image(systemName:saved?.symbol ?? "tag.fill").font(.title2).foregroundStyle(narvieGreen)
                    .frame(width:54,height:54).background(narvieCream,in:RoundedRectangle(cornerRadius:18))
                VStack(alignment:.leading,spacing:4) {
                    Text(name).font(.title2.bold())
                    Label(connected ? "Dichtbij · Bluetooth verbonden" : "Bluetooth niet verbonden",systemImage:connected ? "checkmark.circle.fill" : "circle.dotted")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength:0)
                if let battery = saved?.battery {
                    VStack(alignment:.trailing,spacing:3) {
                        Label("\(battery)%",systemImage:"battery.100percent").font(.subheadline.weight(.semibold))
                        Text("Laatst gelezen").font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
            if let observation {
                VStack(alignment:.leading,spacing:5) {
                    Label(observation.stale ? "Oudere waarneming" : "Laatste netwerkwaarneming",systemImage:"mappin.circle.fill").font(.headline)
                    Text(observation.observedAt.formatted(date:.abbreviated,time:.standard)).font(.subheadline)
                    Text(observation.accuracy.map { "Nauwkeurigheid circa \($0.formatted(.number.precision(.fractionLength(0)))) meter" } ?? "Nauwkeurigheid niet opgegeven")
                        .font(.caption).foregroundStyle(.secondary)
                    Text("Bron: leveranciersnetwerk · geen continue GPS-positie").font(.caption).foregroundStyle(.secondary)
                }
            } else {
                Text(cloud.signedIn && serial != cloud.tracker?.sn ? "Deze tracker is lokaal bewaard. Voor deze Narvie-toegang is nog geen locatiekoppeling beschikbaar." : cloud.message)
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            if let error = cloud.error { Label(error,systemImage:"exclamationmark.circle").font(.footnote).foregroundStyle(.red).accessibilityIdentifier("location-error") }
            HStack(spacing:12) {
                Button {
                    if cloud.signedIn { Task { await cloud.refresh() } } else { signingIn = true }
                } label: {
                    Label(cloud.busy ? "Ophalen…" : "Locatie vernieuwen",systemImage:"arrow.clockwise").frame(maxWidth:.infinity).padding(.vertical,6)
                }.buttonStyle(.borderedProminent).disabled(cloud.busy || (cloud.signedIn && serial != cloud.tracker?.sn))
                if let observation {
                    Link(destination:routeURL(observation)) { Label("Route",systemImage:"arrow.triangle.turn.up.right.diamond").padding(.vertical,6) }
                        .buttonStyle(.bordered)
                }
            }
            if let saved {
                if connected {
                    Button { ble.send(.ring) } label: { Label("Laat mijn tracker piepen",systemImage:"speaker.wave.2.fill").frame(maxWidth:.infinity).padding(.vertical,6) }
                        .buttonStyle(.bordered).disabled(!ble.canOperate)
                } else {
                    Button { ble.reconnect(saved) } label: { Label(ble.connecting ? "Verbinden…" : "Dichtbij zoeken",systemImage:"antenna.radiowaves.left.and.right").frame(maxWidth:.infinity).padding(.vertical,6) }
                        .buttonStyle(.bordered).disabled(ble.connecting || ble.busy || ble.scanning)
                }
                if connected || ble.connecting { Text(ble.status).font(.caption).foregroundStyle(.secondary) }
                if let time = saved.batteryReadAt { Text("Batterij gelezen: \(time.formatted(date:.abbreviated,time:.shortened))").font(.caption2).foregroundStyle(.secondary) }
            } else {
                Button("Mijn tracker via Bluetooth toevoegen",systemImage:"plus.circle") { adding = true }.font(.subheadline)
            }
            if cloud.signedIn {
                Button("Afmelden voor locaties") { Task { await cloud.logout() } }.font(.caption).disabled(cloud.busy)
            }
            Text("Persoonlijke versie · echte gegevens zodra ontvangen").font(.caption2).foregroundStyle(.secondary)
        }
    }
    private func focus() {
        if let observation {
            camera = .region(MKCoordinateRegion(center:CLLocationCoordinate2D(latitude:observation.latitude,longitude:observation.longitude),span:MKCoordinateSpan(latitudeDelta:0.008,longitudeDelta:0.008)))
        } else {
            camera = .region(MKCoordinateRegion(center:CLLocationCoordinate2D(latitude:52.2,longitude:5.3),span:MKCoordinateSpan(latitudeDelta:3.4,longitudeDelta:3.4)))
        }
    }
    private func routeURL(_ observation:CloudObservation) -> URL {
        var parts = URLComponents(string:"https://maps.apple.com/")!
        parts.queryItems = [URLQueryItem(name:"daddr",value:"\(observation.latitude),\(observation.longitude)")]
        return parts.url!
    }
}

struct CloudSignIn: View {
    @ObservedObject var cloud: CloudLocation
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Label("Jouw tracker op de kaart",systemImage:"map.fill").font(.title2.bold()).foregroundStyle(narvieGreen)
                    Text("Meld je aan met jouw persoonlijke Narvie-wachtwoord om de laatste netwerkwaarneming op te vragen.")
                    SecureField("Narvie-wachtwoord",text:$password).textContentType(.password).autocorrectionDisabled()
                        .disabled(cloud.busy)
                    Button(cloud.busy ? "Aanmelden…" : "Aanmelden en locatie ophalen") {
                        let submitted = password; password = ""
                        Task { await cloud.login(submitted); if cloud.signedIn { dismiss(); await cloud.refresh() } }
                    }.disabled(password.isEmpty || cloud.busy)
                    if cloud.busy { ProgressView("De eerste verbinding kan even duren…") }
                    if let error = cloud.error { Text(error).foregroundStyle(.red).font(.footnote) }
                } footer: { Text("Gebruik hier geen MyTag-wachtwoord of trackercode. De sessie wordt alleen tijdelijk in het geheugen bewaard. Voor lokaal zoeken is aanmelden niet nodig.") }
            }.navigationTitle("Mijn locaties").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement:.cancellationAction) { Button("Sluiten") { password = ""; dismiss() } } }
        }.interactiveDismissDisabled(cloud.busy)
    }
}
