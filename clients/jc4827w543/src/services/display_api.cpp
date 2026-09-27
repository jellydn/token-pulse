#include "display_api.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

#include "core/settings_policy.h"

#ifndef DISPLAY_URL
#define DISPLAY_URL "https://tokens.example.ts.net/api/display"
#endif
#ifndef HTTP_TIMEOUT_MS
#define HTTP_TIMEOUT_MS 15000
#endif
#ifndef SKIP_TLS_VERIFY
#define SKIP_TLS_VERIFY 0
#endif
#ifndef DISPLAY_ROOT_CA
#define DISPLAY_ROOT_CA ""
#endif

namespace services {

namespace {
StaticJsonDocument<2048> jsonDocument;
}

void DisplayApi::begin() {
  Preferences preferences;
  preferences.begin("display", true);
  const String savedUrl = preferences.getString("url", DISPLAY_URL);
  preferences.end();
  snprintf(url_, sizeof(url_), "%s", savedUrl.c_str());
  if (!settings::isValidDisplayUrl(url_)) {
    snprintf(url_, sizeof(url_), "%s", DISPLAY_URL);
  }
}

bool DisplayApi::fetchCurrent() {
  char fresh[sizeof(payload_)];
  if (!fetch(url_, fresh, sizeof(fresh)) || !isValidPayload(fresh)) {
    lastFetchOk_ = false;
    if (hasPayload_) setStatus("Fetch failed; showing last update");
    return false;
  }
  memcpy(payload_, fresh, sizeof(payload_));
  hasPayload_ = true;
  lastFetchOk_ = true;
  setStatus("Display API connected");
  return true;
}

bool DisplayApi::testAndSave(const char* candidateUrl) {
  if (!settings::isValidDisplayUrl(candidateUrl)) {
    setStatus("Use https://host/api/display with no credentials");
    return false;
  }
  if (WiFi.status() != WL_CONNECTED) {
    setStatus("Connect Wi-Fi before testing the API");
    return false;
  }
  setStatus("Testing without saving...");
  char fresh[sizeof(payload_)];
  if (!fetch(candidateUrl, fresh, sizeof(fresh)) || !isValidPayload(fresh)) {
    setStatus("Test failed; previous URL was kept");
    return false;
  }

  snprintf(url_, sizeof(url_), "%s", candidateUrl);
  memcpy(payload_, fresh, sizeof(payload_));
  hasPayload_ = true;
  lastFetchOk_ = true;
  Preferences preferences;
  preferences.begin("display", false);
  preferences.putString("url", url_);
  preferences.end();
  setStatus("Test passed; URL saved");
  return true;
}

const char* DisplayApi::url() const { return url_; }
const char* DisplayApi::payload() const { return payload_; }
const char* DisplayApi::status() const { return status_; }
bool DisplayApi::hasPayload() const { return hasPayload_; }
bool DisplayApi::lastFetchOk() const { return lastFetchOk_; }

bool DisplayApi::fetch(const char* url, char* output, std::size_t outputSize) {
  WiFiClientSecure client;
#if SKIP_TLS_VERIFY
  client.setInsecure();
#else
  if (DISPLAY_ROOT_CA[0] == '\0') {
    setStatus("No CA configured; HTTPS failed closed");
    Serial.println("Display API blocked: DISPLAY_ROOT_CA is empty");
    return false;
  }
  client.setCACert(DISPLAY_ROOT_CA);
#endif

  HTTPClient http;
  if (!http.begin(client, url)) {
    setStatus("Could not open display API URL");
    return false;
  }
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Accept", "application/json");
  http.addHeader("User-Agent", "token-pulse-jc4827/1.0");
  const int code = http.GET();
  if (code < 200 || code >= 300) {
    Serial.printf("Display API HTTP status=%d\n", code);
    http.end();
    return false;
  }
  const String body = http.getString();
  http.end();
  if (body.isEmpty() || body.length() >= outputSize) {
    setStatus("Display API response was empty or too large");
    return false;
  }
  memcpy(output, body.c_str(), body.length() + 1);
  return true;
}

bool DisplayApi::isValidPayload(const char* json) {
  jsonDocument.clear();
  const DeserializationError error = deserializeJson(jsonDocument, json);
  if (error || !jsonDocument.is<JsonObjectConst>()) return false;
  JsonObjectConst root = jsonDocument.as<JsonObjectConst>();
  if (!root["providers"].is<JsonArrayConst>() || !root["today"].is<JsonObjectConst>() ||
      !root["degraded"].is<bool>()) {
    return false;
  }
  JsonObjectConst today = root["today"].as<JsonObjectConst>();
  const bool tokensValid = today["tokens"].is<long>() || today["tokens"].is<int>() ||
                           today["tokens"].is<float>() || today["tokens"].is<double>();
  const bool costValid = today["cost"].is<long>() || today["cost"].is<int>() ||
                         today["cost"].is<float>() || today["cost"].is<double>();
  const bool messageValid = !root.containsKey("message") || root["message"].isNull() ||
                            root["message"].is<const char*>();
  const bool topProjectValid = !root.containsKey("topProject") ||
                               root["topProject"].isNull() ||
                               root["topProject"].is<JsonObjectConst>();
  return tokensValid && costValid && messageValid && topProjectValid;
}

void DisplayApi::setStatus(const char* status) {
  snprintf(status_, sizeof(status_), "%s", status);
}

}  // namespace services
