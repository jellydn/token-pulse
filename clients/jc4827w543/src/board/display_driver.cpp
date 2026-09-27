#include "display_driver.h"

#include <Arduino.h>

namespace board {

bool DisplayDriver::begin() {
  pinMode(kBacklight, OUTPUT);
  digitalWrite(kBacklight, HIGH);
  return gfx_.begin();
}

void DisplayDriver::showBootScreen() {
  gfx_.fillScreen(0x0000);
  gfx_.setTextColor(0xFFFF);
  gfx_.setTextSize(3);
  gfx_.setCursor(16, 16);
  gfx_.println("Token Pulse");
  gfx_.setTextSize(2);
  gfx_.setCursor(16, 56);
  gfx_.println("Starting touch settings...");
}

void DisplayDriver::registerLvgl() {
  lv_disp_draw_buf_init(&drawBuffer_, pixels_, nullptr, kWidth * 20);
  lv_disp_drv_init(&displayDriver_);
  displayDriver_.hor_res = kWidth;
  displayDriver_.ver_res = kHeight;
  displayDriver_.flush_cb = flush;
  displayDriver_.draw_buf = &drawBuffer_;
  displayDriver_.user_data = this;
  lv_disp_drv_register(&displayDriver_);
}

void DisplayDriver::flush(lv_disp_drv_t* driver, const lv_area_t* area,
                          lv_color_t* pixels) {
  auto* self = static_cast<DisplayDriver*>(driver->user_data);
  const std::int32_t width = area->x2 - area->x1 + 1;
  const std::int32_t height = area->y2 - area->y1 + 1;
  self->gfx_.draw16bitRGBBitmap(area->x1, area->y1,
                               reinterpret_cast<std::uint16_t*>(pixels), width, height);
  lv_disp_flush_ready(driver);
}

}  // namespace board
