Narvie Trackers — iPhone 0.5.0

Native SwiftUI / CoreBluetooth app, separate from Narvie 4G and the PWA.
Bundle: nl.narvie.mytag.sampletest. Home-screen label remains Narvie Test during this personal test phase.

BUILD
Open NarvieMyTagTest.xcodeproj in Xcode. Use the owner's authorized signing team and a connected, unlocked iPhone. A clean source project deliberately has no personal signing team. make_project.py recreates the unsigned project and icons; do not run it over an already signed project without preserving its local signing configuration.

LOCAL WORKFLOW
Open Mijn trackers > Mijn tracker toevoegen. Confirm that it is your own tracker, scan, manually select the sample and check its read serial. Give it a name and icon and tap Bewaar mijn tracker. This saves only local iPhone metadata; it does not activate or claim cloud ownership. No real sample identifiers or credentials are embedded in source.
Saved tracker details provide Opnieuw verbinden, serial verification, ring, battery refresh, rename/icon and local removal. Reconnect uses CoreBluetooth retrievePeripherals for the remembered iOS UUID, then checks the actual SN before further commands. A changed/mismatched SN closes the connection. If iOS no longer knows the UUID, the owner re-adds the same physical tracker by scanning. No automatic selection of the strongest signal.
The battery measurement has a real read timestamp. Saved values survive disconnect and reopening as previous readings, never as current location or presence. The active BLE values clear after disconnect. Ring is never automatic. Backgrounding closes BLE; no background tracking mode.

LOCATION
The Locatie tab embeds only the existing Narvie HTTPS owner test page using a nonpersistent WKWebView. No merchant token or owner password is stored in the app. The existing one-sample location API still waits for the supplier to clarify its decrypted v2 object schema. No fake coordinates or claims of remote location support.

DATA
Local UserDefaults key: nl.narvie.mytag.native.savedTrackers.v1. Serial, peripheral UUID, chosen name/icon, last measured battery/time and firmware are local metadata. No locations, tokens or passwords are persisted here. Removing a local tracker does not reset/unpair the hardware or change MyTag.

CHECKS
ProtocolChecks.swift: 14 parser checks. SavedTrackerChecks.swift: 18 storage/identity checks (isolated test defaults, no real hardware data). Compile these separately with CityTagProtocol.swift; the storage checks also require SavedTrackers.swift. Test helpers are not included in app Sources.
0.4.2 hardware evidence: assigned SN matched, firmware 0.9.19, battery 98%, owner heard three beeps. 0.5.0 adds persistence/reconnect/UI; that new workflow needs its own device verification. See BUILD_STATUS.txt for the current installation status.

ANDROID
No native Android build is delivered by this iPhone project. The separate web/PWA interface remains available. Its iPhone Bluetooth limitations still apply; Capacitor config alone is not a native Android implementation.
