# WebSerial installer preparation

Related to [#13](https://github.com/jellydn/token-pulse/issues/13). Not a
published or hardware-tested release. Keep #13 open until USB flashing,
serial logs, working protected HTTPS access, and release hosting are tested.

## Build a candidate

From the repository root:

```sh
pio run -d clients/jc4827w543 -e jc4827w543c
python3 clients/jc4827w543/scripts/package_installer.py \
  --build clients/jc4827w543/.pio/build/jc4827w543c \
  --framework "$HOME/.platformio/packages/framework-arduinoespressif32" \
  --output clients/jc4827w543/.pio/web-installer \
  --version "$(git describe --tags --always --dirty)"
cd clients/jc4827w543/.pio/web-installer
sha256sum -c SHA256SUMS
```

The package copies the static page, versioned manifest, checksums, and four
images. ESP32-S3 uses bootloader at 0, partitions at 0x8000, boot_app0 at
0xE000, application at 0x10000. These match the pinned Arduino 2.0.17
PlatformIO builder, not the original ESP32 bootloader offset of 0x1000.
Separate images avoid writing merged-image padding over Preferences/NVS.
An explicit erase still removes all device settings. Back up first.

CI uses PlatformIO 6.2.0, espressif32 6.8.1, and the exact direct library
versions in platformio.ini. It tests the native policy, both firmware targets,
and packaging, then uploads a candidate artifact. Tags matching
`jc4827w543-v*` also build artifacts. This is a repeatable build recipe, not
a claim of byte-identical builds across hosts or a verified physical image.
CI has read-only repository access; it does not create releases or deploy Pages.

## Release gate

1. Complete [physical validation](../HARDWARE_VALIDATION.md) for the exact commit.
2. Supply the deployment's trusted CA and test device access to the protected
   origin. Generic builds fail closed with an empty CA. Do not publish a build
   containing private Wi-Fi, service tokens, or other credentials.
3. Test first install, update without erase, explicit erase, wrong-chip error,
   cancelled selection, disconnect during flash, and Logs & Console at 115200.
   Use the CLI to validate the candidate first. For the browser test, set
   `tokenPulseHardwareTestRecord` in `manifest.json` to the HTTPS URL of that
   completed record. This is maintainer release metadata, not an automatic
   verification. CI always emits `null` and the page disables installation.
4. After maintainer approval, attach the tested package/checksums/test record
   to a tagged GitHub Release and serve its extracted files together over
   HTTPS (for example GitHub Pages). Do not serve private Token Pulse data there.
5. Update the README with that real installer URL. There is no deployed URL yet.

ESP Web Tools detects ESP32-S3, not the PCB/display model. The visible board
warning is still essential. The page stays disabled if the manifest is absent,
wrong-family, the external flasher fails to load, or Web Serial is unavailable.
Use current desktop Chrome/Edge; iOS browsers cannot flash. The upstream
component owns flash progress, errors, and Logs & Console. No Improv Wi-Fi
provisioning is enabled; configure Wi-Fi and API URL with on-device Settings.

## License and attribution

The page loads **ESP Web Tools 10.1.0** from unpkg. It uses Espressif's
esptool-js. Both are Apache-2.0 licensed:

- [ESP Web Tools source/license](https://github.com/esphome/esp-web-tools)
- [esptool-js source/license](https://github.com/espressif/esptool-js)

An Internet connection is required to load the pinned flasher module. No code
or assets were copied from non-commercial Guition flasher projects.
The [PlatformIO CLI](../README.md#build-and-flash) remains the fallback.
