Narvie Trackers — iPhone 0.6.0, build 8

SwiftUI / CoreBluetooth / MapKit. Separate from Narvie 4G. Bundle remains
nl.narvie.mytag.sampletest, so this updates the existing personal sample app.
Home screen label: Narvie Trackers.

BUILD
Open NarvieMyTagTest.xcodeproj. Use the existing authorized signing team and
a connected unlocked iPhone. make_project.py creates an unsigned clean source
project: do not overwrite a locally signed project without preserving signing.
No supplier token, owner password, sample serial or private location in source.

MAP AND LOCATION
Kaart replaces the old embedded web view. Explicitly request the last supplier
observation with Locatie vernieuwen. Personal owner login uses the existing
Narvie HTTPS API; password and session are not persisted. No new account.
Only the configured assigned tracker is available remotely. A local saved tag
never acquires cloud ownership merely by being saved. API locations appear
only for an exact matching serial. Invalid/demo/future data never becomes a pin.
No fake marker or current-phone-location permission. The default Netherlands
viewport is only an empty map overview. Route opens Apple Maps after user click.
Apple MapKit supplies map tiles; locations and API answers are not cached by us.
Errors retain a previously received observation with its original date.
The explicit refresh has supplier-side throttling; no automatic polling.
13 November: real location successfully displayed through the owner web UI.
Native map rendering/login still needs its own physical-device verification.

LOCAL TRACKER
Mijn trackers > toevoegen > confirm own tag > scan > manually choose > check
read serial > choose name/icon > Bewaar mijn tracker. Reconnect verifies the
actual SN before battery or ring commands. No strongest-signal auto-selection.
Historical battery readings always have their original read timestamp.
Local metadata: nl.narvie.mytag.native.savedTrackers.v1. Removing a local entry
does not unpair, reset or change MyTag. Backgrounding closes BLE.

CHECKS
14 protocol decoder checks, 18 storage/identity checks, 24 location/identity
checks. Test helper mains are separate from app sources. The 24 location checks
use synthetic data, not live coordinates. Unsigned arm64 device build succeeded.
Physical hardware evidence from 0.4.2 remains: correct SN, firmware 0.9.19,
98% battery, three audible beeps. New save/reconnect and native map interactions
need separate device confirmation. See BUILD_STATUS.txt.

LIMITS
Personal one-owner / one-assigned-SN backend, not customer account management.
The supplier test hop remains explicitly approved HTTP; phone-to-Narvie is HTTPS.
No background location, notifications or ownership-transfer implementation yet.
Android native build is a separate route; PWA is not proof of Android native BLE.
