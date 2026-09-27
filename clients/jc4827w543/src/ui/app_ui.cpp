#include "app_ui.h"

#include <Arduino.h>
#include <ArduinoJson.h>

#include "core/settings_policy.h"

namespace ui {

namespace {
constexpr lv_color_t kBackground = LV_COLOR_MAKE(12, 18, 28);
constexpr lv_color_t kPanel = LV_COLOR_MAKE(25, 34, 49);
constexpr lv_color_t kAccent = LV_COLOR_MAKE(34, 197, 94);
constexpr lv_color_t kMuted = LV_COLOR_MAKE(148, 163, 184);

lv_obj_t* makeView(lv_obj_t* screen) {
  lv_obj_t* view = lv_obj_create(screen);
  lv_obj_set_size(view, 480, 272);
  lv_obj_set_pos(view, 0, 0);
  lv_obj_set_style_bg_color(view, kBackground, 0);
  lv_obj_set_style_border_width(view, 0, 0);
  lv_obj_set_style_pad_all(view, 0, 0);
  lv_obj_clear_flag(view, LV_OBJ_FLAG_SCROLLABLE);
  return view;
}

lv_obj_t* makeTitle(lv_obj_t* parent, const char* text) {
  lv_obj_t* label = lv_label_create(parent);
  lv_label_set_text(label, text);
  lv_obj_set_style_text_font(label, &lv_font_montserrat_20, 0);
  lv_obj_set_pos(label, 70, 14);
  return label;
}
}  // namespace

AppUi::AppUi(services::WifiService& wifi, services::DisplayApi& api)
    : wifi_(wifi), api_(api) {}

void AppUi::begin() {
  lv_obj_t* screen = lv_scr_act();
  lv_obj_set_style_bg_color(screen, kBackground, 0);
  lv_obj_set_style_text_color(screen, lv_color_white(), 0);
  lv_obj_clear_flag(screen, LV_OBJ_FLAG_SCROLLABLE);

  dashboardView_ = makeView(screen);
  lv_obj_t* title = lv_label_create(dashboardView_);
  lv_label_set_text(title, "Token Pulse");
  lv_obj_set_style_text_font(title, &lv_font_montserrat_28, 0);
  lv_obj_set_pos(title, 16, 12);
  makeButton(dashboardView_, "Settings", 370, 8, 102, onOpenSettings, this);
  dashboardStatus_ = lv_label_create(dashboardView_);
  lv_obj_set_pos(dashboardStatus_, 16, 52);
  lv_obj_set_size(dashboardStatus_, 448, 20);
  lv_obj_set_style_text_color(dashboardStatus_, kMuted, 0);
  lv_label_set_long_mode(dashboardStatus_, LV_LABEL_LONG_DOT);
  summaryLabel_ = lv_label_create(dashboardView_);
  lv_obj_set_pos(summaryLabel_, 16, 86);
  lv_obj_set_style_text_font(summaryLabel_, &lv_font_montserrat_20, 0);
  providersLabel_ = lv_label_create(dashboardView_);
  lv_obj_set_pos(providersLabel_, 16, 126);
  lv_obj_set_size(providersLabel_, 448, 136);
  lv_obj_set_style_text_color(providersLabel_, kMuted, 0);

  settingsView_ = makeView(screen);
  makeButton(settingsView_, LV_SYMBOL_LEFT, 8, 6, 48, onBackDashboard, this);
  makeTitle(settingsView_, "Device settings");
  makeButton(settingsView_, "Wi-Fi", 24, 80, 200, onOpenWifi, this);
  makeButton(settingsView_, "Display API", 256, 80, 200, onOpenApi, this);
  settingsStatus_ = lv_label_create(settingsView_);
  lv_obj_set_pos(settingsStatus_, 24, 150);
  lv_obj_set_size(settingsStatus_, 432, 80);
  lv_obj_set_style_text_color(settingsStatus_, kMuted, 0);
  lv_label_set_long_mode(settingsStatus_, LV_LABEL_LONG_WRAP);

  wifiView_ = makeView(screen);
  makeButton(wifiView_, LV_SYMBOL_LEFT, 8, 6, 48, onBackSettings, this);
  makeTitle(wifiView_, "Wi-Fi settings");
  scanButton_ = makeButton(wifiView_, "Scan", 394, 6, 78, onScan, this);
  wifiStatus_ = lv_label_create(wifiView_);
  lv_obj_set_pos(wifiStatus_, 12, 54);
  lv_obj_set_size(wifiStatus_, 350, 20);
  lv_obj_set_style_text_color(wifiStatus_, kMuted, 0);
  lv_label_set_long_mode(wifiStatus_, LV_LABEL_LONG_DOT);
  forgetButton_ = makeButton(wifiView_, "Forget", 394, 46, 78, onForget, this);
  networkList_ = lv_list_create(wifiView_);
  lv_obj_set_size(networkList_, 464, 176);
  lv_obj_set_pos(networkList_, 8, 92);
  lv_obj_set_style_bg_color(networkList_, kPanel, 0);
  lv_obj_set_style_border_width(networkList_, 0, 0);
  lv_obj_set_scroll_dir(networkList_, LV_DIR_VER);
  lv_obj_set_scrollbar_mode(networkList_, LV_SCROLLBAR_MODE_AUTO);

  credentialView_ = makeView(screen);
  makeButton(credentialView_, LV_SYMBOL_LEFT, 8, 6, 48, onCredentialBack, this);
  credentialTitle_ = makeTitle(credentialView_, "Network");
  lv_obj_set_size(credentialTitle_, 305, 24);
  lv_label_set_long_mode(credentialTitle_, LV_LABEL_LONG_DOT);
  makeButton(credentialView_, "Connect", 386, 6, 86, onConnect, this);
  credentialStatus_ = lv_label_create(credentialView_);
  lv_obj_set_pos(credentialStatus_, 12, 54);
  lv_obj_set_size(credentialStatus_, 456, 20);
  lv_obj_set_style_text_color(credentialStatus_, kMuted, 0);
  lv_label_set_long_mode(credentialStatus_, LV_LABEL_LONG_DOT);
  passwordField_ = lv_textarea_create(credentialView_);
  lv_obj_set_size(passwordField_, 456, 46);
  lv_obj_set_pos(passwordField_, 12, 76);
  lv_textarea_set_one_line(passwordField_, true);
  lv_textarea_set_password_mode(passwordField_, true);
  lv_textarea_set_max_length(passwordField_, 64);
  lv_textarea_set_placeholder_text(passwordField_, "Wi-Fi password");
  lv_obj_add_event_cb(passwordField_, onTextField, LV_EVENT_ALL, this);

  apiView_ = makeView(screen);
  makeButton(apiView_, LV_SYMBOL_LEFT, 8, 6, 48, onBackSettings, this);
  makeTitle(apiView_, "Display API");
  makeButton(apiView_, "Test + save", 358, 6, 114, onApiTest, this);
  apiStatus_ = lv_label_create(apiView_);
  lv_obj_set_pos(apiStatus_, 12, 54);
  lv_obj_set_size(apiStatus_, 456, 20);
  lv_obj_set_style_text_color(apiStatus_, kMuted, 0);
  lv_label_set_long_mode(apiStatus_, LV_LABEL_LONG_DOT);
  apiUrlField_ = lv_textarea_create(apiView_);
  lv_obj_set_size(apiUrlField_, 456, 46);
  lv_obj_set_pos(apiUrlField_, 12, 76);
  lv_textarea_set_one_line(apiUrlField_, true);
  lv_textarea_set_max_length(apiUrlField_, 255);
  lv_textarea_set_placeholder_text(apiUrlField_, "https://host/api/display");
  lv_obj_add_event_cb(apiUrlField_, onTextField, LV_EVENT_ALL, this);

  keyboard_ = lv_keyboard_create(screen);
  lv_obj_set_size(keyboard_, 480, 136);
  lv_obj_align(keyboard_, LV_ALIGN_BOTTOM_MID, 0, 0);
  lv_obj_add_event_cb(keyboard_, onKeyboard, LV_EVENT_READY, this);
  lv_obj_add_event_cb(keyboard_, onKeyboard, LV_EVENT_CANCEL, this);
  lv_obj_add_flag(keyboard_, LV_OBJ_FLAG_HIDDEN);

  showOnly(dashboardView_);
  updateDashboard();
}

void AppUi::update() {
  if (millis() - lastRenderMs_ < 100) return;
  lastRenderMs_ = millis();
  if (!lv_obj_has_flag(wifiView_, LV_OBJ_FLAG_HIDDEN)) updateWifiView();
  if (!lv_obj_has_flag(settingsView_, LV_OBJ_FLAG_HIDDEN)) {
    char status[192];
    snprintf(status, sizeof(status), "Wi-Fi: %s\nAPI: %s",
             wifi_.connected() ? wifi_.connectedSsid() : "offline", api_.status());
    lv_label_set_text(settingsStatus_, status);
  }
  if (!lv_obj_has_flag(dashboardView_, LV_OBJ_FLAG_HIDDEN)) updateDashboard();
}

void AppUi::onOpenSettings(lv_event_t* event) {
  auto* app = static_cast<AppUi*>(lv_event_get_user_data(event));
  app->showOnly(app->settingsView_);
}
void AppUi::onBackDashboard(lv_event_t* event) {
  auto* app = static_cast<AppUi*>(lv_event_get_user_data(event));
  app->showOnly(app->dashboardView_);
}
void AppUi::onOpenWifi(lv_event_t* event) {
  auto* app = static_cast<AppUi*>(lv_event_get_user_data(event));
  app->showOnly(app->wifiView_);
  app->updateWifiView();
  if (app->wifi_.scanGeneration() == 0 &&
      app->wifi_.state() != services::WifiState::Connecting) {
    app->wifi_.scan();
  }
}
void AppUi::onOpenApi(lv_event_t* event) {
  auto* app = static_cast<AppUi*>(lv_event_get_user_data(event));
  lv_textarea_set_text(app->apiUrlField_, app->api_.url());
  lv_label_set_text(app->apiStatus_, app->api_.status());
  app->showOnly(app->apiView_);
}
void AppUi::onBackSettings(lv_event_t* event) {
  auto* app = static_cast<AppUi*>(lv_event_get_user_data(event));
  app->showOnly(app->settingsView_);
}
void AppUi::onScan(lv_event_t* event) {
  static_cast<AppUi*>(lv_event_get_user_data(event))->wifi_.scan();
}
void AppUi::onForget(lv_event_t* event) {
  auto* app = static_cast<AppUi*>(lv_event_get_user_data(event));
  app->wifi_.forget();
  app->wifi_.scan();
}

void AppUi::onNetwork(lv_event_t* event) {
  auto* choice = static_cast<NetworkChoice*>(lv_event_get_user_data(event));
  const services::WifiState state = choice->app->wifi_.state();
  if (choice->scanGeneration != choice->app->wifi_.scanGeneration() ||
      state == services::WifiState::Scanning || state == services::WifiState::Connecting) {
    return;
  }
  if (!choice->supported) {
    lv_label_set_text(choice->app->wifiStatus_, "This network security is unsupported.");
    return;
  }
  choice->app->showCredentials(choice->ssid, choice->secure);
}

void AppUi::onCredentialBack(lv_event_t* event) {
  auto* app = static_cast<AppUi*>(lv_event_get_user_data(event));
  lv_textarea_set_text(app->passwordField_, "");
  app->showOnly(app->wifiView_);
}
void AppUi::onConnect(lv_event_t* event) {
  static_cast<AppUi*>(lv_event_get_user_data(event))->connectSelectedNetwork();
}
void AppUi::onApiTest(lv_event_t* event) {
  static_cast<AppUi*>(lv_event_get_user_data(event))->testApiUrl();
}
void AppUi::onTextField(lv_event_t* event) {
  const lv_event_code_t code = lv_event_get_code(event);
  if (code == LV_EVENT_CLICKED || code == LV_EVENT_FOCUSED) {
    auto* app = static_cast<AppUi*>(lv_event_get_user_data(event));
    app->showKeyboard(lv_event_get_target(event));
  }
}
void AppUi::onKeyboard(lv_event_t* event) {
  auto* app = static_cast<AppUi*>(lv_event_get_user_data(event));
  if (lv_event_get_code(event) == LV_EVENT_READY) {
    if (app->keyboardField_ == app->passwordField_) {
      app->connectSelectedNetwork();
    } else {
      app->testApiUrl();
    }
  } else {
    app->hideKeyboard();
  }
}

lv_obj_t* AppUi::makeButton(lv_obj_t* parent, const char* text, lv_coord_t x,
                            lv_coord_t y, lv_coord_t width, lv_event_cb_t callback,
                            void* userData) {
  lv_obj_t* button = lv_btn_create(parent);
  lv_obj_set_size(button, width, 40);
  lv_obj_set_pos(button, x, y);
  lv_obj_set_style_bg_color(button, kAccent, 0);
  lv_obj_set_style_pad_all(button, 4, 0);
  lv_obj_add_event_cb(button, callback, LV_EVENT_CLICKED, userData);
  lv_obj_t* label = lv_label_create(button);
  lv_label_set_text(label, text);
  lv_obj_center(label);
  return button;
}

void AppUi::showOnly(lv_obj_t* view) {
  hideKeyboard();
  lv_obj_t* views[] = {dashboardView_, settingsView_, wifiView_, credentialView_, apiView_};
  for (lv_obj_t* candidate : views) {
    if (candidate == view) {
      lv_obj_clear_flag(candidate, LV_OBJ_FLAG_HIDDEN);
      lv_obj_move_foreground(candidate);
    } else {
      lv_obj_add_flag(candidate, LV_OBJ_FLAG_HIDDEN);
    }
  }
}

void AppUi::showCredentials(const char* ssid, bool secure) {
  snprintf(selectedSsid_, sizeof(selectedSsid_), "%s", ssid);
  if (!secure) {
    wifi_.connect(selectedSsid_, "");
    updateWifiView();
    return;
  }
  lv_label_set_text(credentialTitle_, selectedSsid_);
  lv_label_set_text(credentialStatus_, "Enter the network password");
  lv_textarea_set_text(passwordField_, "");
  showOnly(credentialView_);
  showKeyboard(passwordField_);
}

void AppUi::showKeyboard(lv_obj_t* field) {
  keyboardField_ = field;
  lv_keyboard_set_textarea(keyboard_, field);
  lv_obj_clear_flag(keyboard_, LV_OBJ_FLAG_HIDDEN);
  lv_obj_move_foreground(keyboard_);
  lv_obj_add_state(field, LV_STATE_FOCUSED);
}

void AppUi::hideKeyboard() {
  lv_keyboard_set_textarea(keyboard_, nullptr);
  lv_obj_add_flag(keyboard_, LV_OBJ_FLAG_HIDDEN);
  if (keyboardField_ != nullptr) {
    lv_obj_clear_state(keyboardField_, LV_STATE_FOCUSED);
    lv_indev_reset(nullptr, keyboardField_);
    keyboardField_ = nullptr;
  }
}

void AppUi::connectSelectedNetwork() {
  const char* password = lv_textarea_get_text(passwordField_);
  const std::size_t length = strlen(password);
  if (!settings::isValidPersonalPassword(password, length)) {
    lv_label_set_text(credentialStatus_,
                      length == 64 ? "A 64-character key must be hexadecimal"
                                   : "Password needs 8 to 63 printable characters");
    return;
  }
  if (!wifi_.connect(selectedSsid_, password)) {
    lv_label_set_text(credentialStatus_, "Wi-Fi is busy. Try again shortly.");
    return;
  }
  lv_textarea_set_text(passwordField_, "");
  showOnly(wifiView_);
  updateWifiView();
}

void AppUi::testApiUrl() {
  hideKeyboard();
  lv_label_set_text(apiStatus_, "Testing without saving...");
  lv_refr_now(nullptr);
  api_.testAndSave(lv_textarea_get_text(apiUrlField_));
  lv_label_set_text(apiStatus_, api_.status());
}

void AppUi::rebuildNetworkList() {
  lv_obj_clean(networkList_);
  if (wifi_.networkCount() == 0) {
    lv_obj_t* label = lv_label_create(networkList_);
    lv_label_set_text(label, "No networks found. Tap Scan to retry.");
    lv_obj_set_style_text_color(label, kMuted, 0);
    return;
  }
  for (std::size_t index = 0; index < wifi_.networkCount(); ++index) {
    const services::WifiNetwork& network = wifi_.network(index);
    const bool supported = services::WifiService::supportsSecurity(network.authMode);
    char label[80];
    snprintf(label, sizeof(label), "%s  %ld dBm  %s%s", network.ssid,
             static_cast<long>(network.rssi),
             services::WifiService::securityName(network.authMode),
             supported ? "" : " (unsupported)");
    NetworkChoice& choice = networkChoices_[index];
    choice.app = this;
    choice.scanGeneration = wifi_.scanGeneration();
    snprintf(choice.ssid, sizeof(choice.ssid), "%s", network.ssid);
    choice.secure = network.secure;
    choice.supported = supported;
    lv_obj_t* button = lv_list_add_btn(networkList_, LV_SYMBOL_WIFI, label);
    lv_obj_add_event_cb(button, onNetwork, LV_EVENT_CLICKED, &choice);
    if (!supported) lv_obj_add_state(button, LV_STATE_DISABLED);
  }
}

void AppUi::updateWifiView() {
  const services::WifiState state = wifi_.state();
  char status[112];
  if (state == services::WifiState::Scanning) {
    snprintf(status, sizeof(status), "Scanning nearby 2.4 GHz networks...");
  } else if (state == services::WifiState::Connecting) {
    snprintf(status, sizeof(status), "%s: %s...", wifi_.connectionStatus(),
             wifi_.connectedSsid());
  } else if (state == services::WifiState::Connected) {
    snprintf(status, sizeof(status), "Connected to %s", wifi_.connectedSsid());
  } else if (wifi_.error()[0] != '\0') {
    snprintf(status, sizeof(status), "%s", wifi_.error());
  } else if (state == services::WifiState::Disconnected) {
    snprintf(status, sizeof(status), "Offline. Reconnecting automatically.");
  } else if (wifi_.scanGeneration() > 0) {
    snprintf(status, sizeof(status), "Found %u 2.4 GHz networks. Swipe list.",
             static_cast<unsigned>(wifi_.networkCount()));
  } else {
    snprintf(status, sizeof(status), "Select a 2.4 GHz network below.");
  }
  lv_label_set_text(wifiStatus_, status);
  const bool busy = state == services::WifiState::Scanning ||
                    state == services::WifiState::Connecting;
  if (busy) lv_obj_add_state(scanButton_, LV_STATE_DISABLED);
  else lv_obj_clear_state(scanButton_, LV_STATE_DISABLED);
  if (wifi_.hasCredentials() || wifi_.connected()) {
    lv_obj_clear_flag(forgetButton_, LV_OBJ_FLAG_HIDDEN);
  } else {
    lv_obj_add_flag(forgetButton_, LV_OBJ_FLAG_HIDDEN);
  }
  if (renderedScanGeneration_ != wifi_.scanGeneration()) {
    renderedScanGeneration_ = wifi_.scanGeneration();
    rebuildNetworkList();
  }
}

void AppUi::updateDashboard() {
  bool degraded = false;
  if (!api_.hasPayload()) {
    lv_label_set_text(summaryLabel_, "No display data yet");
    lv_label_set_text(providersLabel_,
                      wifi_.connected() ? api_.status() : "Open Settings to configure Wi-Fi");
  } else {
    static StaticJsonDocument<2048> document;
    document.clear();
    if (!deserializeJson(document, api_.payload())) {
      degraded = document["degraded"] | false;
      JsonObjectConst today = document["today"].as<JsonObjectConst>();
      char summary[80];
      snprintf(summary, sizeof(summary), "Today: %lld tokens  $%.2f",
               static_cast<long long>(today["tokens"] | 0),
               static_cast<double>(today["cost"] | 0.0));
      lv_label_set_text(summaryLabel_, summary);
      char providers[256]{};
      std::size_t shown = 0;
      for (JsonObjectConst provider : document["providers"].as<JsonArrayConst>()) {
        if (shown == 4) break;
        char row[64];
        snprintf(row, sizeof(row), "%s: %d%% remaining\n",
                 provider["name"] | "Provider", provider["remainingPercent"] | -1);
        strlcat(providers, row, sizeof(providers));
        ++shown;
      }
      lv_label_set_text(providersLabel_, providers[0] == '\0' ? "No providers" : providers);
    }
  }
  char status[128];
  const char* badge = "";
  if (api_.hasPayload() && !api_.lastFetchOk()) badge = "  •  STALE";
  else if (degraded) badge = "  •  DEGRADED";
  snprintf(status, sizeof(status), "%s  •  %s%s",
           wifi_.connected() ? wifi_.connectedSsid() : "Wi-Fi offline", api_.status(),
           badge);
  lv_label_set_text(dashboardStatus_, status);
}

}  // namespace ui
