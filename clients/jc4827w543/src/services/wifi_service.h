#pragma once

#include <Arduino.h>

namespace services {

enum class WifiState : std::uint8_t {
  NotConfigured,
  Disconnected,
  Scanning,
  Connecting,
  Connected,
  Failed,
};

struct WifiNetwork {
  char ssid[33]{};
  std::int32_t rssi{0};
  std::uint8_t authMode{0};
  bool secure{false};
};

class WifiService {
 public:
  static constexpr std::size_t kMaxNetworks = 8;

  void begin();
  void update();
  void scan();
  bool connect(const char* ssid, const char* password);
  void forget();
  WifiState state() const;
  bool connected() const;
  bool hasCredentials() const;
  const char* connectedSsid() const;
  const char* error() const;
  std::size_t networkCount() const;
  const WifiNetwork& network(std::size_t index) const;
  std::uint32_t scanGeneration() const;
  const char* connectionStatus() const;
  static const char* securityName(std::uint8_t authMode);
  static bool supportsSecurity(std::uint8_t authMode);

 private:
  enum class ConnectionStage : std::uint8_t {
    Idle,
    WaitingForDisconnect,
    WaitingForIp,
    WaitingForCleanup,
  };

  void startConnection(const char* ssid, const char* password, bool saveOnSuccess);
  void beginPendingConnection();
  void failForDisconnectReason(std::uint8_t reason);
  void failConnection(const char* message, bool disconnectFirst = false);
  void resetWifiStorage();
  void loadCredentials();
  void savePendingCredentials();
  void finishScan(std::int16_t count);
  void setError(const char* message);

  WifiState state_{WifiState::NotConfigured};
  WifiNetwork networks_[kMaxNetworks]{};
  std::size_t networkCount_{0};
  std::uint32_t scanGeneration_{0};
  std::uint32_t attemptStartedMs_{0};
  std::uint32_t lastReconnectMs_{0};
  std::uint32_t attemptDisconnectGeneration_{0};
  std::uint32_t attemptGotIpGeneration_{0};
  volatile std::uint32_t disconnectGeneration_{0};
  volatile std::uint32_t gotIpGeneration_{0};
  volatile std::uint8_t disconnectReason_{0};
  volatile bool associated_{false};
  std::uint8_t lastRetryReason_{0};
  char savedSsid_[33]{};
  char savedPassword_[65]{};
  char pendingSsid_[33]{};
  char pendingPassword_[65]{};
  char error_[96]{};
  ConnectionStage connectionStage_{ConnectionStage::Idle};
  bool saveOnSuccess_{false};
};

}  // namespace services
