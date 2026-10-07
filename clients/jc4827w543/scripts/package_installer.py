"""Package the pinned PlatformIO target for ESP Web Tools; never publish it."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path


def package_installer(build, framework, output, version):
    images = [
        (build / "bootloader.bin", 0, 0x8000),
        (build / "partitions.bin", 0x8000, 0x1000),
        (framework / "tools/partitions/boot_app0.bin", 0xE000, 0x2000),
        (build / "firmware.bin", 0x10000, 1310720),
    ]
    # Check everything before writing a manifest that could select a wrong image.
    for source, _, limit in images:
        size = source.stat().st_size
        if not 0 < size <= limit:
            raise ValueError(f"Invalid size for {source.name}: {size}")
    output.mkdir(parents=True, exist_ok=True)
    firmware = output / "firmware"
    firmware.mkdir(exist_ok=True)
    parts = []
    checksums = []
    for source, offset, _ in images:
        destination = firmware / source.name
        shutil.copyfile(source, destination)
        path = f"firmware/{source.name}"
        parts.append({"path": path, "offset": offset})
        checksums.append(f"{hashlib.sha256(destination.read_bytes()).hexdigest()}  {path}")
    manifest = {
        "name": "Token Pulse JC4827W543C",
        "version": version,
        "tokenPulseHardwareTestRecord": None,
        "new_install_prompt_erase": True,
        "new_install_improv_wait_time": 0,
        "builds": [{"chipFamily": "ESP32-S3", "parts": parts}],
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (output / "SHA256SUMS").write_text("\n".join(checksums) + "\n")
    installer = Path(__file__).resolve().parents[1] / "installer"
    for source in installer.iterdir():
        if source.is_file():
            shutil.copyfile(source, output / source.name)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build", type=Path, required=True)
    parser.add_argument("--framework", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--version", required=True)
    args = parser.parse_args()
    package_installer(args.build, args.framework, args.output, args.version)
