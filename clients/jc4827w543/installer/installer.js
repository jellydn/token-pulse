const status = document.getElementById("status");
const installer = document.getElementById("installer");

if (!window.isSecureContext || !("serial" in navigator)) {
  status.textContent =
    "Web Serial is not available. Use desktop Chrome or Edge on HTTPS, or the CLI fallback.";
} else {
  try {
    const response = await fetch("manifest.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Firmware unavailable");
    const manifest = await response.json();
    if (
      manifest.name !== "Token Pulse JC4827W543C" ||
      typeof manifest.version !== "string" ||
      manifest.builds?.length !== 1 ||
      manifest.builds[0].chipFamily !== "ESP32-S3"
    ) {
      throw new Error("Wrong board manifest");
    }
    document.getElementById("version").textContent =
      `Firmware: ${manifest.version} · Check its hardware test record before flashing.`;
    if (
      typeof manifest.tokenPulseHardwareTestRecord !== "string" ||
      !manifest.tokenPulseHardwareTestRecord.startsWith("https://")
    ) {
      status.textContent =
        "Candidate only. Installation is disabled until a hardware test record is published.";
    } else {
      const record = document.createElement("a");
      record.href = manifest.tokenPulseHardwareTestRecord;
      record.textContent = "Read the hardware test record";
      document.getElementById("version").append(" ", record);
      // Pin the flasher version; keep credentials and application data out of this page.
      await import(
        "https://unpkg.com/esp-web-tools@10.1.0/dist/web/install-button.js?module"
      );
      installer.setAttribute("manifest", "manifest.json");
      installer.hidden = false;
      status.textContent =
        "Ready to connect. Confirm your board and firmware test record.";
    }
  } catch {
    status.textContent =
      "Installer unavailable. No usable firmware package or flasher was loaded. Use the CLI fallback.";
  }
}
