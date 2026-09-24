/*
 * Token Pulse — Guition JC4827W543C client
 *
 * ESP32-S3 + 480x272 NV3041A (QSPI) + GT911. Fetches GET /api/display.
 * Never contacts CodexBar and never embeds provider credentials.
 *
 * The panel stays powered, so this sketch polls in loop() instead of deep
 * sleep. A failed fetch keeps the last accepted payload and draws STALE.
 */

#include <Arduino.h>
#include <ArduinoJson.h>
#include <Arduino_GFX_Library.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Wire.h>

#ifndef WIFI_SSID
#define WIFI_SSID "your-ssid"
#endif
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD "your-password"
#endif
#ifndef DISPLAY_URL
#define DISPLAY_URL "https://tokens.example.ts.net/api/display"
#endif
#ifndef REFRESH_SECONDS
#define REFRESH_SECONDS 300
#endif
#ifndef HTTP_TIMEOUT_MS
#define HTTP_TIMEOUT_MS 15000
#endif
#ifndef WIFI_TIMEOUT_MS
#define WIFI_TIMEOUT_MS 20000
#endif
#ifndef SKIP_TLS_VERIFY
#define SKIP_TLS_VERIFY 0
#endif
#ifndef DISPLAY_ROOT_CA
#define DISPLAY_ROOT_CA ""
#endif

// Vendor QSPI map for JC4827W543C. Not the RGB pinout of ESP32-4827S043.
#define LCD_CS 45
#define LCD_SCK 47
#define LCD_D0 21
#define LCD_D1 48
#define LCD_D2 40
#define LCD_D3 39
#define LCD_BL 1

#define TOUCH_SDA 8
#define TOUCH_SCL 4
#define TOUCH_RST 38
#define TOUCH_INT 3
#define GT911_ADDR_LOW 0x5D
#define GT911_ADDR_HIGH 0x14

#define SCREEN_W 480
#define SCREEN_H 272
#define MAX_PROVIDERS 4

static Arduino_DataBus *bus = new Arduino_ESP32QSPI(
    LCD_CS, LCD_SCK, LCD_D0, LCD_D1, LCD_D2, LCD_D3);
static Arduino_GFX *gfx =
    new Arduino_NV3041A(bus, GFX_NOT_DEFINED /* RST */, 0 /* rotation */, true);

static char lastJson[2048] = {0};
static bool hasLastFrame = false;
static bool lastFetchOk = false;
static bool touchOk = false;
static uint32_t lastPollMs = 0;
static StaticJsonDocument<2048> jsonDoc;

// Numeric RGB565. Arduino_GFX 1.4.x names these BLACK/GREEN; later releases
// renamed them to RGB565_*. Literals compile against either header.
static const uint16_t COL_BG = 0x0000;
static const uint16_t COL_FG = 0xFFFF;
static const uint16_t COL_OK = 0x07E0;
static const uint16_t COL_WARN = 0xFD20;
static const uint16_t COL_BAD = 0xF800;
static const uint16_t COL_DIM = 0x7BEF;
static const int16_t BAR_X = 300;
static const int16_t BAR_W = 160;

static bool configureTls(WiFiClientSecure &client) {
#if SKIP_TLS_VERIFY
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

static bool fetchDisplay(char *buffer, size_t bufferSize) {
  HTTPClient http;
  WiFiClientSecure client;
  if (!configureTls(client)) return false;
  if (!http.begin(client, DISPLAY_URL)) {
    Serial.println("HTTP begin failed");
    return false;
  }
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  http.addHeader("Accept", "application/json");
  http.addHeader("User-Agent", "token-pulse-jc4827/1.0");

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
 * Same display-model checks as the e-paper sketch. A bare `{}` must not
 * replace the last accepted payload.
 */
static bool isValidDisplayJson(const char *json) {
  jsonDoc.clear();
  const DeserializationError err = deserializeJson(jsonDoc, json);
  if (err || !jsonDoc.is<JsonObjectConst>()) return false;

  JsonObjectConst root = jsonDoc.as<JsonObjectConst>();
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

static void formatTokens(int64_t tokens, char *out, size_t outSize) {
  if (tokens >= 1000000) {
    snprintf(out, outSize, "%.1fM", tokens / 1000000.0);
  } else if (tokens >= 1000) {
    snprintf(out, outSize, "%.1fK", tokens / 1000.0);
  } else {
    snprintf(out, outSize, "%lld", (long long)tokens);
  }
}

static uint16_t percentColor(int remaining) {
  if (remaining < 0) return COL_DIM;
  if (remaining < 10) return COL_BAD;
  if (remaining < 25) return COL_WARN;
  return COL_OK;
}

static void drawBadge(const char *label, uint16_t color) {
  gfx->setTextSize(2);
  const int16_t w = (int16_t)strlen(label) * 12 + 16;
  const int16_t x = SCREEN_W - w - 8;
  gfx->fillRect(x, 8, w, 26, color);
  gfx->setTextColor(COL_FG);
  gfx->setCursor(x + 8, 14);
  gfx->print(label);
}

/** INT low during reset selects GT911 address 0x5D. Probe only; no touch UI. */
static bool probeGt911() {
  pinMode(TOUCH_INT, OUTPUT);
  pinMode(TOUCH_RST, OUTPUT);
  digitalWrite(TOUCH_INT, LOW);
  digitalWrite(TOUCH_RST, LOW);
  delay(20);
  digitalWrite(TOUCH_RST, HIGH);
  delay(50);
  pinMode(TOUCH_INT, INPUT);

  Wire.begin(TOUCH_SDA, TOUCH_SCL);
  Wire.setClock(100000);
  Wire.beginTransmission(GT911_ADDR_LOW);
  if (Wire.endTransmission() == 0) return true;
  Wire.beginTransmission(GT911_ADDR_HIGH);
  return Wire.endTransmission() == 0;
}

static void paintBoot(const char *status) {
  gfx->fillScreen(COL_BG);
  gfx->setTextColor(COL_FG);
  gfx->setTextSize(3);
  gfx->setCursor(16, 16);
  gfx->print("Token Pulse");
  gfx->setTextSize(2);
  gfx->setCursor(16, 56);
  gfx->print("JC4827W543C");
  gfx->setCursor(16, 88);
  gfx->setTextColor(touchOk ? COL_OK : COL_WARN);
  gfx->print(touchOk ? "GT911 ok" : "GT911 --");
  gfx->setTextColor(COL_FG);
  gfx->setCursor(16, 128);
  gfx->print(status);
}

static void paintPayload(const char *json, bool stale) {
  jsonDoc.clear();
  if (deserializeJson(jsonDoc, json)) {
    paintBoot("Invalid JSON");
    if (stale) drawBadge("STALE", COL_WARN);
    return;
  }

  const char *updatedAt = jsonDoc["updatedAt"] | (const char *)nullptr;
  const bool degraded = jsonDoc["degraded"] | false;
  JsonObjectConst today = jsonDoc["today"].as<JsonObjectConst>();
  const int64_t todayTokens = today["tokens"] | 0;
  const double todayCost = today["cost"] | 0.0;

  char tokenBuf[16];
  char costBuf[16];
  char updatedBuf[24] = "waiting";
  formatTokens(todayTokens, tokenBuf, sizeof(tokenBuf));
  snprintf(costBuf, sizeof(costBuf), "$%.2f", todayCost);
  if (updatedAt && strlen(updatedAt) >= 16) {
    snprintf(updatedBuf, sizeof(updatedBuf), "%.10s %.5s", updatedAt,
             updatedAt + 11);
  }

  gfx->fillScreen(COL_BG);
  gfx->setTextColor(COL_FG);
  gfx->setTextSize(3);
  gfx->setCursor(16, 12);
  gfx->print("Token Pulse");

  gfx->setTextSize(2);
  gfx->setCursor(16, 48);
  gfx->setTextColor(touchOk ? COL_OK : COL_DIM);
  gfx->print(touchOk ? "GT911" : "GT911 --");
  gfx->setTextColor(COL_DIM);
  gfx->setCursor(220, 48);
  gfx->print(updatedBuf);

  int16_t y = 84;
  JsonArrayConst providers = jsonDoc["providers"].as<JsonArrayConst>();
  int shown = 0;
  if (providers.isNull() || providers.size() == 0) {
    gfx->setTextColor(COL_FG);
    gfx->setCursor(16, y);
    gfx->print("No providers");
  } else {
    for (JsonObjectConst provider : providers) {
      if (shown >= MAX_PROVIDERS) break;
      const char *name = provider["name"] | "Provider";
      char nameBuf[15];
      snprintf(nameBuf, sizeof(nameBuf), "%.14s", name);
      const int remaining = provider["remainingPercent"] | -1;
      gfx->setTextColor(COL_FG);
      gfx->setCursor(16, y);
      gfx->print(nameBuf);
      gfx->setTextColor(percentColor(remaining));
      gfx->setCursor(200, y);
      if (remaining >= 0) {
        gfx->printf("%d%%", remaining);
      } else {
        gfx->print("--%");
      }
      const int barW = remaining >= 0 ? remaining * BAR_W / 100 : 0;
      gfx->drawRect(BAR_X, y + 2, BAR_W, 14, COL_DIM);
      if (barW > 0) {
        gfx->fillRect(BAR_X, y + 2, barW, 14, percentColor(remaining));
      }
      y += 32;
      shown++;
    }
  }

  gfx->drawFastHLine(16, SCREEN_H - 40, SCREEN_W - 32, COL_DIM);
  gfx->setTextColor(COL_FG);
  gfx->setCursor(16, SCREEN_H - 28);
  gfx->printf("Today %s  %s", tokenBuf, costBuf);

  if (stale || !lastFetchOk) {
    drawBadge("STALE", COL_WARN);
  } else if (degraded) {
    drawBadge("DEGRADED", COL_WARN);
  }
}

static void pollAndPaint() {
  char fresh[sizeof(lastJson)];
  bool ok = false;
  if (connectWifi()) {
    ok = fetchDisplay(fresh, sizeof(fresh));
  } else {
    Serial.println("Wi-Fi failed");
  }

  if (ok && isValidDisplayJson(fresh)) {
    memcpy(lastJson, fresh, sizeof(lastJson));
    hasLastFrame = true;
    lastFetchOk = true;
    paintPayload(lastJson, false);
    return;
  }

  lastFetchOk = false;
  if (hasLastFrame) {
    Serial.println("Fetch failed; keeping last frame");
    paintPayload(lastJson, true);
    return;
  }
  paintBoot(ok ? "Invalid JSON" : "Offline");
  drawBadge(ok ? "STALE" : "OFFLINE", COL_BAD);
}

void setup() {
  Serial.begin(115200);
  delay(300);

  pinMode(LCD_BL, OUTPUT);
  digitalWrite(LCD_BL, HIGH);

  if (!gfx->begin()) {
    Serial.println("gfx->begin() failed");
  }
  gfx->fillScreen(COL_BG);
  touchOk = probeGt911();
  Serial.printf("GT911 %s\n", touchOk ? "ok" : "not found");
  paintBoot("Connecting...");

  pollAndPaint();
  lastPollMs = millis();
}

void loop() {
  const uint32_t now = millis();
  if (now - lastPollMs < (uint32_t)REFRESH_SECONDS * 1000UL) {
    delay(50);
    return;
  }
  lastPollMs = now;
  pollAndPaint();
}
