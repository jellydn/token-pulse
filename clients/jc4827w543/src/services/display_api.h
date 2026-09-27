#pragma once

#include <Arduino.h>

namespace services {

class DisplayApi {
 public:
  void begin();
  bool fetchCurrent();
  bool testAndSave(const char* candidateUrl);
  const char* url() const;
  const char* payload() const;
  const char* status() const;
  bool hasPayload() const;
  bool lastFetchOk() const;

 private:
  bool fetch(const char* url, char* output, std::size_t outputSize);
  bool isValidPayload(const char* json);
  void setStatus(const char* status);

  char url_[256]{};
  char payload_[2048]{};
  char status_[96]{"Waiting for Wi-Fi"};
  bool hasPayload_{false};
  bool lastFetchOk_{false};
};

}  // namespace services
