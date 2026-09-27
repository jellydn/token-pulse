#pragma once

#include <Arduino_GFX_Library.h>
#include <lvgl.h>

#include "board_config.h"

namespace board {

class DisplayDriver {
 public:
  bool begin();
  void showBootScreen();
  void registerLvgl();

 private:
  static void flush(lv_disp_drv_t* driver, const lv_area_t* area, lv_color_t* pixels);

  Arduino_ESP32QSPI bus_{kLcdCs, kLcdSck, kLcdD0, kLcdD1, kLcdD2, kLcdD3};
  Arduino_NV3041A gfx_{&bus_, GFX_NOT_DEFINED, 0, true};
  lv_disp_draw_buf_t drawBuffer_{};
  lv_disp_drv_t displayDriver_{};
  lv_color_t pixels_[kWidth * 20]{};
};

}  // namespace board
