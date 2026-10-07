import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from package_installer import package_installer


class PackageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.build = root / "build"
        self.framework = root / "framework"
        self.output = root / "site"
        self.build.mkdir()
        (self.framework / "tools/partitions").mkdir(parents=True)
        for index, name in enumerate(["bootloader.bin", "partitions.bin", "firmware.bin"]):
            (self.build / name).write_bytes(bytes([index + 1]) * (17 + index))
        (self.framework / "tools/partitions/boot_app0.bin").write_bytes(b"boot-app")

    def package(self):
        package_installer(self.build, self.framework, self.output, "v1.2.3-test")

    def test_offsets_and_asymmetric_image_contents(self):
        self.package()
        manifest = json.loads((self.output / "manifest.json").read_text())
        self.assertEqual(manifest["name"], "Token Pulse JC4827W543C")
        self.assertEqual(manifest["version"], "v1.2.3-test")
        self.assertEqual(manifest["builds"][0]["chipFamily"], "ESP32-S3")
        self.assertIsNone(manifest["tokenPulseHardwareTestRecord"])
        self.assertEqual([part["offset"] for part in manifest["builds"][0]["parts"]],
                         [0, 32768, 57344, 65536])
        self.assertEqual(manifest["new_install_improv_wait_time"], 0)
        self.assertEqual((self.output / "firmware/firmware.bin").read_bytes(), b"\x03" * 19)
        self.assertEqual((self.output / "firmware/bootloader.bin").read_bytes(), b"\x01" * 17)
        self.assertIn(hashlib.sha256(b"\x03" * 19).hexdigest() + "  firmware/firmware.bin",
                      (self.output / "SHA256SUMS").read_text())
        self.assertTrue((self.output / "index.html").is_file())

    def test_missing_image_does_not_create_manifest(self):
        (self.build / "partitions.bin").unlink()
        with self.assertRaises(FileNotFoundError):
            self.package()
        self.assertFalse(self.output.exists())

    def test_empty_and_oversize_application_rejected(self):
        for size in [0, 1310721]:
            with self.subTest(size=size):
                (self.build / "firmware.bin").write_bytes(b"x" * size)
                with self.assertRaises(ValueError):
                    self.package()
                self.assertFalse(self.output.exists())

    def test_maximum_application_size_accepted(self):
        (self.build / "firmware.bin").write_bytes(b"x" * 1310720)
        self.package()
        self.assertEqual((self.output / "firmware/firmware.bin").stat().st_size, 1310720)


if __name__ == "__main__":
    unittest.main()
