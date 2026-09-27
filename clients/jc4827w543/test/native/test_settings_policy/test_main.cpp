#include <unity.h>

#include <cstring>

#include "core/settings_policy.h"

using settings::DisconnectAction;

namespace {

void test_maps_disconnect_reasons() {
  TEST_ASSERT_EQUAL(static_cast<int>(DisconnectAction::Ignore),
                    static_cast<int>(settings::classifyDisconnectReason(8)));
  TEST_ASSERT_EQUAL(static_cast<int>(DisconnectAction::Retry),
                    static_cast<int>(settings::classifyDisconnectReason(2)));
  TEST_ASSERT_EQUAL(static_cast<int>(DisconnectAction::NetworkUnavailable),
                    static_cast<int>(settings::classifyDisconnectReason(201)));
  TEST_ASSERT_EQUAL(static_cast<int>(DisconnectAction::Authentication),
                    static_cast<int>(settings::classifyDisconnectReason(202)));
  TEST_ASSERT_EQUAL(static_cast<int>(DisconnectAction::UnsupportedSecurity),
                    static_cast<int>(settings::classifyDisconnectReason(20)));
}

void test_validates_personal_passwords() {
  const char* passphrase = "correct horse battery staple";
  const char* hexKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const char* nonHexKey = "z123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  TEST_ASSERT_TRUE(settings::isValidPersonalPassword(passphrase, std::strlen(passphrase)));
  TEST_ASSERT_TRUE(settings::isValidPersonalPassword(hexKey, std::strlen(hexKey)));
  TEST_ASSERT_FALSE(settings::isValidPersonalPassword("1234567", 7));
  TEST_ASSERT_FALSE(settings::isValidPersonalPassword(nonHexKey, std::strlen(nonHexKey)));
  TEST_ASSERT_FALSE(settings::isValidPersonalPassword("password\n", 9));
  TEST_ASSERT_TRUE(settings::isValidPersonalPassword(" password ", 10));
}

void test_accepts_only_https_display_endpoint_urls() {
  TEST_ASSERT_TRUE(settings::isValidDisplayUrl("https://tokens.example.ts.net/api/display"));
  TEST_ASSERT_TRUE(settings::isValidDisplayUrl("https://192.168.1.20:3000/api/display"));
  TEST_ASSERT_FALSE(settings::isValidDisplayUrl("http://tokens.local/api/display"));
  TEST_ASSERT_FALSE(settings::isValidDisplayUrl("https://tokens.local/"));
  TEST_ASSERT_FALSE(settings::isValidDisplayUrl("https://user:pass@tokens.local/api/display"));
  TEST_ASSERT_FALSE(settings::isValidDisplayUrl("https:///api/display"));
  TEST_ASSERT_FALSE(settings::isValidDisplayUrl("https://tokens.local/api/display?key=secret"));
}

}  // namespace

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_maps_disconnect_reasons);
  RUN_TEST(test_validates_personal_passwords);
  RUN_TEST(test_accepts_only_https_display_endpoint_urls);
  return UNITY_END();
}
