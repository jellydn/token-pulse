#include "touch_driver.h"

#include "board_config.h"

namespace board {

namespace {
constexpr std::uint16_t kProductIdRegister = 0x8140;
constexpr std::uint16_t kStatusRegister = 0x814E;
constexpr std::uint16_t kFirstPointRegister = 0x814F;
}  // namespace

bool TouchDriver::begin() {
  pinMode(kTouchInterrupt, OUTPUT);
  pinMode(kTouchReset, OUTPUT);
  digitalWrite(kTouchInterrupt, LOW);
  digitalWrite(kTouchReset, LOW);
  delay(20);
  digitalWrite(kTouchReset, HIGH);
  delay(50);
  pinMode(kTouchInterrupt, INPUT);

  Wire.begin(kTouchSda, kTouchScl, 100000);
  if (probe(0x5D)) {
    address_ = 0x5D;
  } else if (probe(0x14)) {
    address_ = 0x14;
  } else {
    return false;
  }
  if (!readRegister(kProductIdRegister, reinterpret_cast<std::uint8_t*>(productId_), 4)) {
    return false;
  }
  productId_[4] = '\0';
  return true;
}

void TouchDriver::registerLvgl() {
  lv_indev_drv_init(&inputDriver_);
  inputDriver_.type = LV_INDEV_TYPE_POINTER;
  inputDriver_.read_cb = readLvgl;
  inputDriver_.user_data = this;
  lv_indev_drv_register(&inputDriver_);
}

const char* TouchDriver::productId() const { return productId_; }
std::uint8_t TouchDriver::address() const { return address_; }

void TouchDriver::readLvgl(lv_indev_drv_t* driver, lv_indev_data_t* data) {
  auto* self = static_cast<TouchDriver*>(driver->user_data);
  std::uint16_t x = 0;
  std::uint16_t y = 0;
  if (self->readPoint(x, y)) {
    data->state = LV_INDEV_STATE_PRESSED;
    data->point.x = x >= kWidth ? kWidth - 1 : x;
    data->point.y = y >= kHeight ? kHeight - 1 : y;
  } else {
    data->state = LV_INDEV_STATE_RELEASED;
  }
}

bool TouchDriver::readPoint(std::uint16_t& x, std::uint16_t& y) {
  std::uint8_t status = 0;
  if (!readRegister(kStatusRegister, &status, 1) || (status & 0x80U) == 0) return false;
  const std::uint8_t count = status & 0x0FU;
  if (count == 0 || count > 5) {
    writeRegister(kStatusRegister, 0);
    return false;
  }
  std::uint8_t point[8]{};
  const bool read = readRegister(kFirstPointRegister, point, sizeof(point));
  writeRegister(kStatusRegister, 0);
  if (!read) return false;
  x = static_cast<std::uint16_t>(point[1] | (point[2] << 8U));
  y = static_cast<std::uint16_t>(point[3] | (point[4] << 8U));
  return true;
}

bool TouchDriver::readRegister(std::uint16_t reg, std::uint8_t* data,
                               std::size_t length) {
  Wire.beginTransmission(address_);
  Wire.write(static_cast<std::uint8_t>(reg >> 8U));
  Wire.write(static_cast<std::uint8_t>(reg));
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(address_, static_cast<std::uint8_t>(length)) != length) return false;
  for (std::size_t index = 0; index < length; ++index) data[index] = Wire.read();
  return true;
}

bool TouchDriver::writeRegister(std::uint16_t reg, std::uint8_t value) {
  Wire.beginTransmission(address_);
  Wire.write(static_cast<std::uint8_t>(reg >> 8U));
  Wire.write(static_cast<std::uint8_t>(reg));
  Wire.write(value);
  return Wire.endTransmission() == 0;
}

bool TouchDriver::probe(std::uint8_t address) {
  Wire.beginTransmission(address);
  return Wire.endTransmission() == 0;
}

}  // namespace board
