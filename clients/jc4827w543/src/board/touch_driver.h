#pragma once

#include <Arduino.h>
#include <Wire.h>
#include <lvgl.h>

namespace board {

class TouchDriver {
 public:
  bool begin();
  void registerLvgl();
  const char* productId() const;
  std::uint8_t address() const;

 private:
  static void readLvgl(lv_indev_drv_t* driver, lv_indev_data_t* data);
  bool readPoint(std::uint16_t& x, std::uint16_t& y);
  bool readRegister(std::uint16_t reg, std::uint8_t* data, std::size_t length);
  bool writeRegister(std::uint16_t reg, std::uint8_t value);
  bool probe(std::uint8_t address);

  lv_indev_drv_t inputDriver_{};
  std::uint8_t address_{0};
  char productId_[5]{"----"};
};

}  // namespace board
