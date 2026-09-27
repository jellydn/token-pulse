#include "settings_policy.h"

#include <cstring>

namespace settings {

namespace {
constexpr std::uint8_t kReasonAuthExpire = 2;
constexpr std::uint8_t kReasonAssociationLeave = 8;
constexpr std::uint8_t kReasonFourWayHandshakeTimeout = 15;
constexpr std::uint8_t kReasonGroupCipherInvalid = 18;
constexpr std::uint8_t kReasonPairwiseCipherInvalid = 19;
constexpr std::uint8_t kReasonAuthenticationModeInvalid = 20;
constexpr std::uint8_t kReasonUnsupportedRsnVersion = 21;
constexpr std::uint8_t kReasonInvalidRsnCapabilities = 22;
constexpr std::uint8_t kReasonEnterpriseAuthenticationFailed = 23;
constexpr std::uint8_t kReasonCipherSuiteRejected = 24;
constexpr std::uint8_t kReasonBadCipherOrAuthenticationMode = 29;
constexpr std::uint8_t kReasonBeaconTimeout = 200;
constexpr std::uint8_t kReasonNoAccessPointFound = 201;
constexpr std::uint8_t kReasonAuthenticationFailed = 202;
constexpr std::uint8_t kReasonAssociationFailed = 203;
constexpr std::uint8_t kReasonHandshakeTimeout = 204;
constexpr std::uint8_t kReasonConnectionFailed = 205;

bool isHexDigit(char value) {
  return (value >= '0' && value <= '9') || (value >= 'a' && value <= 'f') ||
         (value >= 'A' && value <= 'F');
}
}  // namespace

DisconnectAction classifyDisconnectReason(std::uint8_t reason) {
  if (reason == kReasonAssociationLeave) return DisconnectAction::Ignore;
  if (reason == kReasonAuthExpire || reason == kReasonFourWayHandshakeTimeout ||
      reason == kReasonBeaconTimeout || reason == kReasonAssociationFailed ||
      reason == kReasonHandshakeTimeout || reason == kReasonConnectionFailed) {
    return DisconnectAction::Retry;
  }
  if (reason == kReasonNoAccessPointFound) return DisconnectAction::NetworkUnavailable;
  if (reason == kReasonEnterpriseAuthenticationFailed ||
      reason == kReasonAuthenticationFailed) {
    return DisconnectAction::Authentication;
  }
  if (reason == kReasonGroupCipherInvalid || reason == kReasonPairwiseCipherInvalid ||
      reason == kReasonAuthenticationModeInvalid ||
      reason == kReasonUnsupportedRsnVersion ||
      reason == kReasonInvalidRsnCapabilities || reason == kReasonCipherSuiteRejected ||
      reason == kReasonBadCipherOrAuthenticationMode) {
    return DisconnectAction::UnsupportedSecurity;
  }
  return DisconnectAction::Connection;
}

bool isValidPersonalPassword(const char* password, std::size_t length) {
  if (password == nullptr || length < 8 || length > 64) return false;
  if (length == 64) {
    for (std::size_t index = 0; index < length; ++index) {
      if (!isHexDigit(password[index])) return false;
    }
    return true;
  }
  for (std::size_t index = 0; index < length; ++index) {
    if (password[index] < 32 || password[index] > 126) return false;
  }
  return true;
}

bool isValidDisplayUrl(const char* url) {
  if (url == nullptr) return false;
  constexpr char kScheme[] = "https://";
  constexpr char kPath[] = "/api/display";
  const std::size_t length = std::strlen(url);
  if (length <= sizeof(kScheme) - 1 + sizeof(kPath) - 1 || length > 255 ||
      std::strncmp(url, kScheme, sizeof(kScheme) - 1) != 0) {
    return false;
  }

  const char* authority = url + sizeof(kScheme) - 1;
  const char* path = std::strchr(authority, '/');
  if (path == nullptr || path == authority || std::strcmp(path, kPath) != 0) return false;
  for (const char* cursor = authority; cursor < path; ++cursor) {
    const unsigned char value = static_cast<unsigned char>(*cursor);
    if (value <= 32 || value >= 127 || *cursor == '@' || *cursor == '#' ||
        *cursor == '?') {
      return false;
    }
  }
  return true;
}

}  // namespace settings
