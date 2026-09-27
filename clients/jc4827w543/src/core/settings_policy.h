#pragma once

#include <cstddef>
#include <cstdint>

namespace settings {

enum class DisconnectAction : std::uint8_t {
  Ignore,
  Retry,
  NetworkUnavailable,
  Authentication,
  UnsupportedSecurity,
  Connection,
};

DisconnectAction classifyDisconnectReason(std::uint8_t reason);
bool isValidPersonalPassword(const char* password, std::size_t length);
bool isValidDisplayUrl(const char* url);

}  // namespace settings
