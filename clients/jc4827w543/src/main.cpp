/*
 * Token Pulse — Guition JC4827W543C client
 *
 * Touch settings configure Wi-Fi and the HTTPS display API URL on-device.
 * The firmware never contacts CodexBar and never logs stored credentials.
 */

#include <Arduino.h>
#include <lvgl.h>

#include "board/display_driver.h"
#include "board/touch_driver.h"
#include "services/display_api.h"
#include "services/wifi_service.h"
#include "ui/app_ui.h"

#ifndef REFRESH_SECONDS
#define REFRESH_SECONDS 300
#endif

namespace {
board::DisplayDriver display;
board::TouchDriver touch;
services::WifiService wifi;
services::DisplayApi api;
ui::AppUi appUi(wifi, api);
std::uint32_t lastPollMs = 0;
bool wasConnected = false;
}  // namespace

void setup() {
  Serial.begin(115200);
  delay(300);
  lv_init();
  if (!display.begin()) Serial.println("NV3041A display initialization failed");
  display.showBootScreen();
  display.registerLvgl();
  if (touch.begin()) {
    Serial.printf("GT911 found at 0x%02X, product ID %s\n", touch.address(),
                  touch.productId());
    touch.registerLvgl();
  } else {
    Serial.println("GT911 not found at 0x5D or 0x14");
  }
  api.begin();
  wifi.begin();
  appUi.begin();
}

void loop() {
  wifi.update();
  appUi.update();
  lv_timer_handler();

  const bool connected = wifi.connected();
  const std::uint32_t now = millis();
  if (connected && (!wasConnected ||
                    now - lastPollMs >= static_cast<std::uint32_t>(REFRESH_SECONDS) * 1000UL)) {
    api.fetchCurrent();
    lastPollMs = millis();
  }
  wasConnected = connected;
  delay(5);
}
