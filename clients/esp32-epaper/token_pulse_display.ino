/*
 * Token Pulse — ESP32 monochrome e-paper client
 *
 * Fetches GET /api/display from a Token Pulse host. Never contacts CodexBar
 * and never embeds provider credentials.
 *
 * Libraries (Arduino Library Manager or PlatformIO):
 *   - GxEPD2 (ZinggJM)
 *   - Adafruit GFX
 *
 * Adjust the GxEPD2 panel typedef and pin map for your module. The layout
 * below targets a 296x128 2.9" black/white panel; larger panels still work
 * with more whitespace.
 */

#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <esp_sleep.h>

#include <GxEPD2_BW.h>
#include <Fonts/FreeMonoBold9pt7b.h>
#include <Fonts/FreeMonoBold12pt7b.h>
#include <Fonts/FreeMono9pt7b.h>

// --- configuration ---------------------------------------------------------

#ifndef WIFI_SSID
#define WIFI_SSID "your-ssid"
#endif
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD "your-password"
#endif

// Full URL to the display-safe JSON endpoint (Tailscale / Access protected).
#ifndef DISPLAY_URL
#define DISPLAY_URL "https://tokens.example.ts.net/api/display"
#endif

// Deep-sleep interval between polls (seconds). Issue default: 5–10 minutes.
#ifndef REFRESH_SECONDS
#define REFRESH_SECONDS 600
#endif

// Full panel refresh every N successful wakes to reduce ghosting.
#ifndef FULL_REFRESH_EVERY
#define FULL_REFRESH_EVERY 6
#endif

#ifndef HTTP_TIMEOUT_MS
#define HTTP_TIMEOUT_MS 15000
#endif

#ifndef WIFI_TIMEOUT_MS
#define WIFI_TIMEOUT_MS 20000
#endif

// Verified HTTPS requires -DDISPLAY_ROOT_CA="..." (PEM). Set
// -DSKIP_TLS_VERIFY=1 only for lab self-signed endpoints on a private network.
#ifndef SKIP_TLS_VERIFY
#define SKIP_TLS_VERIFY 0
#endif
#ifndef DISPLAY_ROOT_CA
#define DISPLAY_ROOT_CA ""
#endif

// GxEPD2 panel selection — change to match your hardware.
// Example: Waveshare 2.9" V2 (SSD1680), busy-high variant.
GxEPD2_BW<GxEPD2_290_BS, GxEPD2_290_BS::HEIGHT> display(
    GxEPD2_290_BS(/*CS=*/5, /*DC=*/17, /*RST=*/16, /*BUSY=*/4));

// RTC memory survives deep sleep; DRAM does not.
RTC_DATA_ATTR uint32_t wakeCount = 0;
RTC_DATA_ATTR char lastJson[1536] = {0};
RTC_DATA_ATTR bool hasLastFrame = false;
RTC_DATA_ATTR bool lastFetchOk = false;

// --- helpers ---------------------------------------------------------------

static void goToSleep() {
  display.powerOff();
  esp_sleep_enable_timer_wakeup((uint64_t)REFRESH_SECONDS * 1000000ULL);
  Serial.printf("Deep sleep %u s\n", (unsigned)REFRESH_SECONDS);
  Serial.flush();
  esp_deep_sleep_start();
}

static bool connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  const uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - start > WIFI_TIMEOUT_MS) return false;
    delay(200);
  }
  return true;
}

/**
 * Configure TLS for HTTPS fetches.
 * Verified builds require a non-empty DISPLAY_ROOT_CA (PEM). Arduino-ESP32
 * WiFiClientSecure does not reliably use a board-wide root store unless a CA
 * or insecure mode is set — an empty verified path fails the handshake.
 * Returns false when the build cannot establish a trust path.
 */
static bool configureTls(WiFiClientSecure &client) {
#if SKIP_TLS_VERIFY
  // Lab-only self-signed endpoints on a private network.
  client.setInsecure();
  return true;
#else
  if (DISPLAY_ROOT_CA[0] == '\0') {
    Serial.println(
        "DISPLAY_ROOT_CA is empty; set a PEM CA or -DSKIP_TLS_VERIFY=1 for lab");
    return false;
  }
  client.setCACert(DISPLAY_ROOT_CA);
  return true;
#endif
}

/**
 * Choose full vs partial window. Full on first wake, every FULL_REFRESH_EVERY
 * wakes, or when no prior frame exists. Partial otherwise (less flicker/power).
 */
static void beginPaint(bool wantFull) {
  if (wantFull || !hasLastFrame) {
    display.setFullWindow();
  } else {
    display.setPartialWindow(0, 0, display.width(), display.height());
  }
}

/**
 * Fetch display JSON into buffer. Returns true on HTTP 2xx with a body.
 * On failure, leaves buffer unchanged so the previous payload can render.
 */
static bool fetchDisplay(char *buffer, size_t bufferSize) {
  HTTPClient http;
  WiFiClientSecure client;
  if (!configureTls(client)) {
    return false;
  }

  if (!http.begin(client, DISPLAY_URL)) {
    Serial.println("HTTP begin failed");
    return false;
  }
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  http.addHeader("Accept", "application/json");
  http.addHeader("User-Agent", "token-pulse-esp32/1.0");

  const int code = http.GET();
  if (code < 200 || code >= 300) {
    Serial.printf("HTTP %d\n", code);
    http.end();
    return false;
  }

  const String body = http.getString();
  http.end();
  if (body.length() == 0 || body.length() >= bufferSize) {
    Serial.println("Body empty or too large");
    return false;
  }

  memcpy(buffer, body.c_str(), body.length() + 1);
  return true;
}

/**
 * True when buffer matches the display-model shape the renderer needs.
 * Rejects bare `{}` so a malformed 2xx body cannot replace lastJson.
 */
static bool isValidDisplayJson(const char *json) {
  StaticJsonDocument<2048> doc;
  const DeserializationError err = deserializeJson(doc, json);
  if (err || !doc.is<JsonObjectConst>()) return false;

  JsonObjectConst root = doc.as<JsonObjectConst>();
  if (!root["providers"].is<JsonArrayConst>()) return false;
  if (!root["today"].is<JsonObjectConst>()) return false;
  JsonObjectConst today = root["today"].as<JsonObjectConst>();
  if (!today["tokens"].is<long>() && !today["tokens"].is<int>() &&
      !today["tokens"].is<float>() && !today["tokens"].is<double>()) {
    return false;
  }
  if (!today["cost"].is<float>() && !today["cost"].is<double>() &&
      !today["cost"].is<long>() && !today["cost"].is<int>()) {
    return false;
  }
  if (!root["degraded"].is<bool>()) return false;
  // message and topProject may be null; key presence is enough when present.
  if (root.containsKey("message") && !root["message"].isNull() &&
      !root["message"].is<const char *>()) {
    return false;
  }
  if (root.containsKey("topProject") && !root["topProject"].isNull() &&
      !root["topProject"].is<JsonObjectConst>()) {
    return false;
  }
  return true;
}

static void drawStatusBadge(const char *label) {
  display.setFont(&FreeMonoBold9pt7b);
  int16_t x1, y1;
  uint16_t w, h;
  display.getTextBounds(label, 0, 0, &x1, &y1, &w, &h);
  const int16_t boxX = display.width() - (int16_t)w - 10;
  const int16_t boxY = 4;
  display.fillRect(boxX - 4, boxY, (int16_t)w + 8, (int16_t)h + 8, GxEPD_BLACK);
  display.setTextColor(GxEPD_WHITE);
  display.setCursor(boxX, boxY + (int16_t)h + 1);
  display.print(label);
  display.setTextColor(GxEPD_BLACK);
}

static void formatTokens(int64_t tokens, char *out, size_t outSize) {
  if (tokens >= 1000000) {
    snprintf(out, outSize, "%.1fM", tokens / 1000000.0);
  } else if (tokens >= 1000) {
    snprintf(out, outSize, "%.1fK", tokens / 1000.0);
  } else {
    snprintf(out, outSize, "%lld", (long long)tokens);
  }
}

static void renderPayload(const char *json, bool stale, bool wantFull) {
  StaticJsonDocument<2048> doc;
  const DeserializationError err = deserializeJson(doc, json);
  if (err) {
    Serial.printf("JSON error: %s\n", err.c_str());
    beginPaint(wantFull);
    display.firstPage();
    do {
      display.fillScreen(GxEPD_WHITE);
      display.setFont(&FreeMonoBold12pt7b);
      display.setCursor(8, 36);
      display.print("Token Pulse");
      display.setFont(&FreeMono9pt7b);
      display.setCursor(8, 64);
      display.print("Invalid JSON");
      if (stale) drawStatusBadge("STALE");
    } while (display.nextPage());
    return;
  }

  const char *updatedAt = doc["updatedAt"] | (const char *)nullptr;
  const bool degraded = doc["degraded"] | false;
  const char *message = doc["message"] | (const char *)nullptr;
  JsonObjectConst today = doc["today"].as<JsonObjectConst>();
  const int64_t todayTokens = today["tokens"] | 0;
  const double todayCost = today["cost"] | 0.0;
  JsonObjectConst topProject = doc["topProject"].as<JsonObjectConst>();
  const char *projectName =
      topProject.isNull() ? nullptr : topProject["name"].as<const char *>();

  char tokenBuf[16];
  formatTokens(todayTokens, tokenBuf, sizeof(tokenBuf));

  char costBuf[16];
  snprintf(costBuf, sizeof(costBuf), "$%.2f", todayCost);

  char updatedBuf[24] = "waiting";
  if (updatedAt && strlen(updatedAt) >= 16) {
    // Prefer compact UTC: YYYY-MM-DD HH:MM
    snprintf(updatedBuf, sizeof(updatedBuf), "%.10s %.5s", updatedAt,
             updatedAt + 11);
  }

  beginPaint(wantFull);
  display.firstPage();
  do {
    display.fillScreen(GxEPD_WHITE);
    display.setTextColor(GxEPD_BLACK);

    display.setFont(&FreeMonoBold12pt7b);
    display.setCursor(8, 22);
    display.print("Token Pulse");

    display.setFont(&FreeMono9pt7b);
    display.setCursor(8, 40);
    display.print(updatedBuf);
    display.print(" UTC");

    int16_t y = 62;
    JsonArrayConst providers = doc["providers"].as<JsonArrayConst>();
    if (providers.isNull() || providers.size() == 0) {
      display.setCursor(8, y);
      display.print("No providers");
      y += 18;
    } else {
      // First provider only on 2.9"; extend the loop for larger panels.
      JsonObjectConst provider = providers[0].as<JsonObjectConst>();
      const char *name = provider["name"] | "Provider";
      const int remaining = provider["remainingPercent"] | -1;
      const char *resetAt = provider["resetAt"] | (const char *)nullptr;
      const char *statusLabel = provider["statusLabel"] | (const char *)nullptr;

      display.setFont(&FreeMonoBold12pt7b);
      display.setCursor(8, y);
      display.print(name);
      y += 20;

      display.setFont(&FreeMonoBold9pt7b);
      display.setCursor(8, y);
      if (remaining >= 0) {
        display.printf("%d%% left", remaining);
      } else {
        display.print("--% left");
      }
      y += 16;

      display.setFont(&FreeMono9pt7b);
      if (resetAt && strlen(resetAt) >= 16) {
        display.setCursor(8, y);
        display.printf("Reset %.10s %.5s", resetAt, resetAt + 11);
        y += 14;
      }
      if (statusLabel && statusLabel[0] != '\0') {
        display.setCursor(8, y);
        display.print(statusLabel);
        y += 14;
      }
    }

    y = max(y, (int16_t)96);
    display.drawFastHLine(8, y - 10, display.width() - 16, GxEPD_BLACK);

    display.setFont(&FreeMono9pt7b);
    display.setCursor(8, y);
    display.printf("Today %s  %s", tokenBuf, costBuf);
    y += 14;

    display.setCursor(8, y);
    if (projectName && projectName[0] != '\0') {
      display.printf("Top %s", projectName);
    } else {
      display.print("Top project: n/a");
    }

    if (message && message[0] != '\0') {
      display.setCursor(8, display.height() - 6);
      display.print(message);
    }

    if (stale || !lastFetchOk) {
      drawStatusBadge("STALE");
    } else if (degraded) {
      drawStatusBadge("DEGRADED");
    }
  } while (display.nextPage());
}

static void renderOffline(bool wantFull) {
  if (hasLastFrame) {
    renderPayload(lastJson, true, wantFull);
    return;
  }
  beginPaint(true);
  display.firstPage();
  do {
    display.fillScreen(GxEPD_WHITE);
    display.setFont(&FreeMonoBold12pt7b);
    display.setCursor(8, 36);
    display.print("Token Pulse");
    display.setFont(&FreeMono9pt7b);
    display.setCursor(8, 64);
    display.print("Offline");
    drawStatusBadge("OFFLINE");
  } while (display.nextPage());
}

// --- entry -----------------------------------------------------------------

void setup() {
  Serial.begin(115200);
  delay(100);
  wakeCount++;

  display.init(115200, true, 50, false);
  display.setRotation(1);
  display.setTextColor(GxEPD_BLACK);

  const bool wantFull =
      (wakeCount == 1) || ((wakeCount % FULL_REFRESH_EVERY) == 0);

  char fresh[sizeof(lastJson)];
  bool ok = false;

  if (connectWifi()) {
    ok = fetchDisplay(fresh, sizeof(fresh));
    WiFi.disconnect(true);
    WiFi.mode(WIFI_OFF);
  } else {
    Serial.println("Wi-Fi failed");
  }

  if (ok) {
    if (isValidDisplayJson(fresh)) {
      memcpy(lastJson, fresh, sizeof(lastJson));
      hasLastFrame = true;
      lastFetchOk = true;
      renderPayload(lastJson, false, wantFull);
    } else {
      // Reject malformed 2xx bodies; keep the last good frame when present.
      Serial.println("Fresh payload failed JSON validation");
      lastFetchOk = false;
      if (hasLastFrame) {
        renderPayload(lastJson, true, wantFull);
      } else {
        beginPaint(true);
        display.firstPage();
        do {
          display.fillScreen(GxEPD_WHITE);
          display.setFont(&FreeMonoBold12pt7b);
          display.setCursor(8, 36);
          display.print("Token Pulse");
          display.setFont(&FreeMono9pt7b);
          display.setCursor(8, 64);
          display.print("Invalid JSON");
        } while (display.nextPage());
      }
    }
  } else {
    lastFetchOk = false;
    renderOffline(wantFull);
  }

  goToSleep();
}

void loop() {
  // Deep sleep never returns here.
}
