# Narvie Trackers — native Android 0.6.0

Separate from Narvie 4G. Application ID `nl.narvie.mytag`, Android 8.0 or newer.

The native Android client contains a MapLibre/OpenFreeMap map, explicit owner
login to the existing Narvie HTTPS server, last-observation time/accuracy,
manual refresh and exact-serial isolation. No supplier token, owner password,
real sample identity or precise customer location is embedded in source or CI.

Bluetooth is implemented with Android BluetoothGatt. Scan and selection are
manual. Reconnect reads and verifies the exact stored serial before battery or
ring commands. Commands use the supplier-confirmed CityTag profile already
tested on iPhone. Android hardware behavior must be tested independently.
No pairing, unbinding, resetting, firmware writes or background tracking.

Local names, icon categories and timestamped prior battery values are stored
in app-private preferences; backup is disabled. Location/session/password are
memory-only. Older Android versions require foreground location permission for
BLE scanning; no phone-GPS location is read. Android 12+ uses Nearby Devices.

## Build

Single-module Java/Gradle project. Sources are kept in this directory with
explicit `sourceSets`; package declarations remain `nl.narvie.mytag`. Gradle
prepares isolated source/resource roots under `prepared/` before building. Open this directory in
Android Studio, or with JDK 17, Gradle 8.11.1 and Android SDK 35 run:

```sh
gradle --no-daemon testDebugUnitTest assembleDebug lintDebug
```

The GitHub Android workflow performs the same build on a standard public
Linux runner, with read-only repository permissions and no supplier secrets.
Its downloadable debug APK is for the owner's test, not a Play Store release.
Build status and device testing must be reported separately. Debug signing on
ephemeral runners can change between builds; a stable private release signing
key is a separate production step and must never be committed publicly.

## Data and map

MapLibre 11.8.0 renders OpenFreeMap Liberty (OpenStreetMap data), with built-in
attribution. The map provider receives requests for viewed map areas; no
supplier token is shared. The default overview has no fake tracker pin.
Route opens the user's maps app only on click. This client still uses the
existing personal one-owner / one-assigned-SN backend. It does not implement
customer account provisioning, ownership transfer or background notifications.

## Test boundary

`ProtocolTest.java` checks serial identity, reply framing, firmware and battery.
`CloudClientTest.java` checks real-response schema with synthetic coordinates,
invalid/demo/future data and serial isolation. No private API call runs in CI.
An APK build alone does not prove Android Bluetooth, permissions or map UI on
a real phone. Those remain a separate physical Android test.
