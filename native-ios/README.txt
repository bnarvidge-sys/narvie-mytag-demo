NARVIE MYTAG - NATIVE IPHONE SAMPLETEST 0.4.0

Dit is een afzonderlijke, kleine native testhuls rond de bestaande HTTPS-
Narvie-interface. Geen wijziging aan Narvie 4G en geen GPS666-koppeling.
App-identiteit: nl.narvie.mytag.sampletest. Weergavenaam: Narvie Test.
De PWA blijft 0.3.2. Het bestaande Capacitor-plan blijft afzonderlijk bewaard;
deze dependency-vrije Swift-test bewijst nog geen Android-implementatie.

INHOUD
- Mijn tracker: bestaande Narvie-interface via HTTPS in WKWebView.
- Bluetooth-test: CoreBluetooth, rechtstreeks op een fysieke iPhone.
- Zoekt maximaal 12 seconden, toont alleen MYTAG-naam of bekende service.
- Gebruiker kiest zelf de eigen sample; naam/RSSI is geen eigendomsbewijs.
- Ontdekt service en eigenschappen; NOTIFY moet aanstaan vóór schrijven.
- Alleen documentcommando's 50 (SN), 32 (firmware), 21/41 (batterij), 42 (piepen).
- Geen reset, accountontkoppeling, sleutelschrijven of firmware-update.
- Eén opdracht tegelijk. Na timeout sluiten om late ACKs niet te verwisselen.
- Alleen echt geparseerde notificaties worden getoond; geen voorbeeld-SN/batterij.
- Resultaten en gevonden apparaten worden niet bewaard/geüpload.
- Bij achtergrond/verbinding verbreken worden lokale meetwaarden gewist.

BRON EN OPEN PUNTEN
Leverancier stuurde op 11 november 2026 om 16:22 een GATT-screenshot:
/Users/brad/Downloads/WhatsApp Image 2026-11-11 at 16.22.29.jpeg
Service 00005301-0000-0041-4c50-574953450000
Write   00005302-0000-0041-4c50-574953450000 (WRITE NO RESPONSE)
Notify  00005303-0000-0041-4c50-574953450000 (NOTIFY, descriptor 2902)
Commando's: nieuwste CityTag_BLE_Instructions_EN_20260826.pdf (1 pagina).
De foto betreft een leveranciersapparaat, niet bewezen de sample van gebruiker.
Raw-byte framing, authenticatie, samplefirmware en meetduur nog niet bevestigd.
Echte API-SN en token-toewijzing nog niet ontvangen. Geen accountbinding op basis
van alleen een lokaal gelezen SN. Sample voorlopig in MyTag laten.

BOUWEN
Xcode staat hier in /Users/brad/Applications/Xcode.app (niet /Applications).
python3 native-ios/make_project.py maakt project en eigen Narvie-icoon.
Open native-ios/NarvieMyTagTest.xcodeproj in Xcode.
Voor installatie: kies eigen iPhone en eigen signing-team, bouw/Run via Xcode.
Geen signing-team, certificaat of provisioningprofiel in de bron vastgelegd.
Bij nieuwe Apple-voorwaarden moet gebruiker zelf beslissen/accepteren.
Bluetooth werkt niet in de iOS-simulator; fysieke tracker vereist.
Een unsigned .app of geslaagde compilatie is geen geïnstalleerde telefoonapp.

PROTOCOLCHECKS
swiftc CityTagProtocol.swift ProtocolChecks.swift -o /tmp/narvie-protocol-checks
/tmp/narvie-protocol-checks
Dit controleert 12 synthetische grensgevallen; geen hardware-/transporttest.

ANDROID
Het leveranciersprofiel en de decoder kunnen ook in de bestaande Capacitor-
route worden gebruikt. Deze ronde levert geen Android-build. De community BLE-
plugin 8.x ondersteunt Capacitor 8 en Android/iOS; pakketinstallatie werd hier
geblokkeerd doordat registry.npmjs.org vanuit de shell niet resolveert.
Daarom geen plugin-installatie, cap sync of Android-build als geslaagd claimen.

PRIMAIRE PLATFORMDOCUMENTATIE
https://developer.apple.com/library/archive/documentation/NetworkingInternetWeb/Conceptual/CoreBluetooth_concepts/PerformingCommonCentralRoleTasks/PerformingCommonCentralRoleTasks.html
https://github.com/capacitor-community/bluetooth-le
