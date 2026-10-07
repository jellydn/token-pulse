/* No Wi-Fi, API requests, or Preferences writes: isolate the board drivers. */
#include <Arduino.h>
#include <lvgl.h>

#include "board/display_driver.h"
#include "board/touch_driver.h"

namespace {
board::DisplayDriver display;
board::TouchDriver touch;
lv_obj_t* coordinates = nullptr;

void showCoordinates(lv_event_t*) {
  auto* pointer = lv_indev_get_act();
  if (!pointer) return;
  lv_point_t point{};
  lv_indev_get_point(pointer, &point);
  lv_label_set_text_fmt(coordinates, "x=%d y=%d", point.x, point.y);
}

void addTarget(lv_coord_t x, lv_coord_t y, const char* text) {
  auto* label = lv_label_create(lv_scr_act());
  lv_label_set_text(label, text);
  lv_obj_set_pos(label, x, y);
}
}  // namespace

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("Token Pulse JC4827W543C hardware smoke test");
  lv_init();
  if (!display.begin()) {
    Serial.println("FAIL: NV3041A initialization");
    return;
  }
  display.showBootScreen();
  delay(1000);
  digitalWrite(board::kBacklight, LOW);
  delay(1000);
  digitalWrite(board::kBacklight, HIGH);
  display.registerLvgl();
  lv_obj_set_style_bg_color(lv_scr_act(), lv_color_hex(0x000000), 0);
  lv_obj_set_style_text_color(lv_scr_act(), lv_color_hex(0xFFFFFF), 0);
  lv_obj_set_style_border_width(lv_scr_act(), 2, 0);
  lv_obj_set_style_border_color(lv_scr_act(), lv_color_hex(0xFF0000), 0);
  addTarget(12, 12, "+ TL");
  addTarget(408, 12, "TR +");
  addTarget(12, 240, "+ BL");
  addTarget(408, 240, "BR +");
  addTarget(220, 126, "+ center");
  coordinates = lv_label_create(lv_scr_act());
  lv_obj_set_pos(coordinates, 120, 180);
  if (touch.begin()) {
    Serial.printf("GT911 address 0x%02X, product %s\n", touch.address(), touch.productId());
    touch.registerLvgl();
    lv_label_set_text(coordinates, "Touch each target");
    lv_obj_add_event_cb(lv_scr_act(), showCoordinates, LV_EVENT_PRESSING, nullptr);
  } else {
    Serial.println("FAIL: GT911 not found");
    lv_label_set_text(coordinates, "FAIL: GT911 not found");
  }
}

void loop() {
  lv_timer_handler();
  delay(5);
}
