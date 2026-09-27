#pragma once

#include <cstdint>

namespace board {

constexpr std::int8_t kLcdCs = 45;
constexpr std::int8_t kLcdSck = 47;
constexpr std::int8_t kLcdD0 = 21;
constexpr std::int8_t kLcdD1 = 48;
constexpr std::int8_t kLcdD2 = 40;
constexpr std::int8_t kLcdD3 = 39;
constexpr std::int8_t kBacklight = 1;
constexpr std::int8_t kTouchSda = 8;
constexpr std::int8_t kTouchScl = 4;
constexpr std::int8_t kTouchReset = 38;
constexpr std::int8_t kTouchInterrupt = 3;
constexpr std::uint16_t kWidth = 480;
constexpr std::uint16_t kHeight = 272;

}  // namespace board
