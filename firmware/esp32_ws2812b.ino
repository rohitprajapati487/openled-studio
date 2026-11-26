#include <Arduino.h>
#include <FS.h>
#include <SPIFFS.h>
#include <FastLED.h>
#include <new>

#define LED_PIN 2

struct Header {
    char magic[5];
    uint16_t version;
    int32_t leds;
    int32_t fps;
    int32_t seconds;
    int32_t frames;
    int32_t nameLen;
    int32_t layout;
    int32_t cols;
    int32_t rows;
} __attribute__((packed));

CRGB *leds = nullptr;

void setup() {
    Serial.begin(115200);
    if (!SPIFFS.begin(true)) {
        Serial.println("SPIFFS fail");
        return;
    }

    File file = SPIFFS.open("/openled.bin", "r");
    if (!file) {
        Serial.println("openled.bin not found");
        return;
    }

    Header header;
    if (file.readBytes((char *)&header, sizeof(header)) != sizeof(header)) {
        Serial.println("Header short");
        return;
    }
    if (memcmp(header.magic, "OJLED", 5) != 0 || header.version != 1) {
        Serial.println("Format unsupported");
        return;
    }

    int count = header.leds < 1 ? 1 : header.leds;
    leds = new (std::nothrow) CRGB[count];
    if (!leds) {
        Serial.println("LED allocation failed");
        return;
    }
    int fps = header.fps < 1 ? 1 : header.fps;
    long dataStart = (long)sizeof(header) + header.nameLen;

    FastLED.addLeds<WS2812B, LED_PIN, GRB>(leds, count);

    int frame = 0;
    while (true) {
        for (int i = 0; i < count; i++) {
            long offset = dataStart + ((long)frame * header.leds + i) * 3;
            file.seek(offset);
            uint8_t rgb[3];
            if (file.readBytes((char *)rgb, 3) == 3) {
                leds[i] = CRGB(rgb[0], rgb[1], rgb[2]);
            }
        }
        FastLED.show();
        delay(1000 / fps);
        frame++;
        if (frame >= header.frames) {
            frame = 0;
        }
    }
}

void loop() {
}
