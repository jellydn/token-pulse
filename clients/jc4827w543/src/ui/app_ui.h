#pragma once

#include <lvgl.h>

#include "services/display_api.h"
#include "services/wifi_service.h"

namespace ui {

class AppUi {
 public:
  AppUi(services::WifiService& wifi, services::DisplayApi& api);
  void begin();
  void update();

 private:
  struct NetworkChoice {
    AppUi* app{nullptr};
    std::uint32_t scanGeneration{0};
    char ssid[33]{};
    bool secure{false};
    bool supported{false};
  };

  static void onOpenSettings(lv_event_t* event);
  static void onBackDashboard(lv_event_t* event);
  static void onOpenWifi(lv_event_t* event);
  static void onOpenApi(lv_event_t* event);
  static void onBackSettings(lv_event_t* event);
  static void onScan(lv_event_t* event);
  static void onForget(lv_event_t* event);
  static void onNetwork(lv_event_t* event);
  static void onCredentialBack(lv_event_t* event);
  static void onConnect(lv_event_t* event);
  static void onApiTest(lv_event_t* event);
  static void onTextField(lv_event_t* event);
  static void onKeyboard(lv_event_t* event);
  static lv_obj_t* makeButton(lv_obj_t* parent, const char* text, lv_coord_t x,
                              lv_coord_t y, lv_coord_t width, lv_event_cb_t callback,
                              void* userData);

  void showOnly(lv_obj_t* view);
  void showCredentials(const char* ssid, bool secure);
  void showKeyboard(lv_obj_t* field);
  void hideKeyboard();
  void connectSelectedNetwork();
  void testApiUrl();
  void rebuildNetworkList();
  void updateWifiView();
  void updateDashboard();

  services::WifiService& wifi_;
  services::DisplayApi& api_;
  std::uint32_t lastRenderMs_{0};
  std::uint32_t renderedScanGeneration_{0};
  char selectedSsid_[33]{};
  lv_obj_t* dashboardView_{nullptr};
  lv_obj_t* settingsView_{nullptr};
  lv_obj_t* wifiView_{nullptr};
  lv_obj_t* credentialView_{nullptr};
  lv_obj_t* apiView_{nullptr};
  lv_obj_t* dashboardStatus_{nullptr};
  lv_obj_t* summaryLabel_{nullptr};
  lv_obj_t* providersLabel_{nullptr};
  lv_obj_t* settingsStatus_{nullptr};
  lv_obj_t* wifiStatus_{nullptr};
  lv_obj_t* networkList_{nullptr};
  lv_obj_t* scanButton_{nullptr};
  lv_obj_t* forgetButton_{nullptr};
  lv_obj_t* credentialTitle_{nullptr};
  lv_obj_t* credentialStatus_{nullptr};
  lv_obj_t* passwordField_{nullptr};
  lv_obj_t* apiStatus_{nullptr};
  lv_obj_t* apiUrlField_{nullptr};
  lv_obj_t* keyboard_{nullptr};
  lv_obj_t* keyboardField_{nullptr};
  NetworkChoice networkChoices_[services::WifiService::kMaxNetworks]{};
};

}  // namespace ui
