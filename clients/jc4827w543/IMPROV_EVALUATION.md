# Improv Wi-Fi: keep the first installer independent

Evaluation for [#15](https://github.com/jellydn/token-pulse/issues/15).
**Decision for this iteration: do not add Improv to production firmware.**
Browser flashing and serial logs work without Improv. Keep on-device Settings
as the Wi-Fi and API configuration path. The installer manifest sets
`new_install_improv_wait_time: 0`, so it does not wait for provisioning.

This is not a claim that Improv is incompatible with the board. It is a
scope decision: the physical touch setup and USB transport are not yet
validated, and a second credential path adds parser, persistence, and
concurrent-connection risks before the first path has passed its test record.
Keep #15 open for the maintainer's decision and any later physical prototype.

## Source compatibility and licenses

The pinned `espressif32@6.8.1` uses Arduino-ESP32 2.0.17. The application
enables USB CDC on boot and uses an asynchronous `WifiService`, with
Preferences storage only after the requested SSID obtains an IP address.
Both the touch UI and any future serial path must use that same service.

| Option | License | Fit for this application |
| --- | --- | --- |
| `improv-wifi/sdk-cpp` | Apache-2.0 | Small protocol parser/builders; application owns serial framing, connection state, and storage |
| `jnthas/Improv-WiFi-Library` 0.0.4 | MIT | Convenience Stream adapter, but connection and scanning are synchronous |
| ESP Web Tools 10.1.0 | Apache-2.0 | Browser installer/logs only; no firmware library is required for flashing |

Reviewed upstream source snapshots:

- [SDK header and API](https://github.com/improv-wifi/sdk-cpp/blob/8e87b560bd5dd7de296847538ea11edb70401d65/src/improv.h)
- [SDK parser and response builders](https://github.com/improv-wifi/sdk-cpp/blob/8e87b560bd5dd7de296847538ea11edb70401d65/src/improv.cpp)
- [SDK license](https://github.com/improv-wifi/sdk-cpp/blob/8e87b560bd5dd7de296847538ea11edb70401d65/LICENSE)
- [Arduino adapter implementation](https://github.com/jnthas/Improv-WiFi-Library/blob/e37c244e0080349e191252acf4bce146eca118e0/src/ImprovWiFiLibrary.cpp)
- [Arduino adapter license](https://github.com/jnthas/Improv-WiFi-Library/blob/e37c244e0080349e191252acf4bce146eca118e0/LICENSE)
- [ESP Web Tools no-Improv install and console](https://github.com/esphome/esp-web-tools/blob/f9d1c4e4055006b9b23ae9d3c9bb6446b7835338/src/install-dialog.ts)
- [PlatformIO framework versions](https://github.com/platformio/platform-espressif32/blob/v6.8.1/platform.json)

The SDK exposes `parse_improv_serial_byte`, `parse_improv_data`, and
`build_rpc_response`. It does not own Wi-Fi or write Preferences. Its standard
vector/string interfaces fit this toolchain; do not use its optional newer
`std::span` API. An adapter still needs a bounded receive buffer, timeouts,
complete frame serialization and strict length checks before parser calls.
The reviewed parser reads command bytes before checking minimum length.
Do not treat it as a validated hostile-input boundary without extra checks.

The Arduino adapter has `setCustomConnectWiFi`, `onImprovConnected`, and
`handleSerial`, but its custom connector returns a synchronous success bool.
Returning true when an async attempt merely starts would report success too
early. Its default connection loop and synchronous scan can block LVGL.
Its fixed serial buffer also needs bounds hardening. This makes the SDK plus
a small service-owned adapter a better future candidate, not a drop-in change.

## Resource impact: measured baseline, unknown candidate delta

Orb build: PlatformIO 6.2.0, pinned target `jc4827w543c`, firmware inherited
from [PR #11](https://github.com/jellydn/token-pulse/pull/11), with the separate
hardware diagnostic excluded from the application target.

| Metric | Production build result |
| --- | --- |
| Application flash | 1,160,989 / 1,310,720 bytes (88.6%) |
| Remaining application partition space | 149,731 bytes |
| Static RAM | 123,992 / 327,680 bytes (37.8%) |
| Improv integration flash/RAM delta | Not measured: no integrated prototype |
| Free runtime heap / stack watermark | Not measured: physical board required |

This documentation-only layer adds no runtime dependency or firmware code,
so it has no firmware size delta. Do not estimate the integrated delta from
upstream source size or an unused linked library: dead-code elimination and
runtime allocations make that misleading. A larger partition is not proposed;
the board still has 4 MB flash and uses `default.csv`.

For a future prototype, compare clean builds at the same commit/toolchain,
with and without the enabled adapter. Record `.elf`/`.bin` sizes and linker
maps, minimum free heap during scan/connect, task stack watermarks, and LVGL
responsiveness. Reject the prototype if the app partition overflows or setup
cannot remain responsive. Keep those measurements with the hardware record.

## Persistence and reset contract for a future adapter

1. Enable provisioning only during an explicit on-device setup window.
   Do not offer always-on credential changes to any attached serial client.
2. Validate packet/SSID/password lengths and the existing security policy;
   copy candidate credentials into bounded RAM and never log them.
3. Call `WifiService::connect()`. Its return value means **attempt accepted**,
   not **connected**. Refuse another serial/touch attempt while busy.
4. Report provisioning success only after a new IP event for the requested
   SSID. Keep `savePendingCredentials()` as the only Preferences write path.
5. Check Wi-Fi-driver storage too. `resetWifiStorage()` clears driver flash
   credentials, then reinitializes with persistence disabled. Do not introduce
   a second `WiFi.begin()` or change flash storage through the adapter.
6. On timeout/authentication failure, retain the prior saved credentials.
   Verify reboot restores them. Do not allow serial failure to erase NVS.
7. **Forget** must call the existing `WifiService::forget()` path: remove
   `wifi/ssid` and `wifi/password`, persist `wifi/disabled`, clear candidates,
   and disable compile-time fallback. API URL remains in the `display`
   namespace. A full-chip installer erase clears both namespaces.
8. Keep API URL and TLS policy on-device/build-time. Improv Wi-Fi does not
   provision publisher CAs, Access tokens, or CodexBar credentials.

Before implementation, test the actual USB connector/CDC runtime port at
115200, reconnect after flashing, malformed/truncated/oversized frames,
scan/connection failures, conflicting touch actions, success-only persistence,
Forget/reboot, and continued on-device setup. Close other serial monitors.
Serialize complete Improv frames so normal logs cannot interleave their bytes.

## Does it improve setup now?

It could remove password entry on a 480×272 touch keyboard after a desktop
flash. It does not solve trusted HTTPS configuration or device authentication
to a protected origin, and it adds a second setup state machine unless it is
carefully tied to `WifiService`. For the first installer, the benefit does not
justify that untested complexity. Revisit after #14 has a completed physical
record and #13 has a tested release. No physical prototype was run in this orb.
