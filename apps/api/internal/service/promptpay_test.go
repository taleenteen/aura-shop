package service

import (
	"fmt"
	"strings"
	"testing"
)

func TestCRC16CCITTKnownVector(t *testing.T) {
	if got := crc16CCITT("123456789"); got != 0x29B1 {
		t.Fatalf("crc16 = %04X, want 29B1", got)
	}
}

func TestPromptPayPayload(t *testing.T) {
	p := promptPayPayload(3990000, "AURA-20261105-1N8B6HYP")
	want := "000201010212" + "29370016A00000067701011101130066000000000" + "5303764" + "540839900.00" + "5802TH" + "62260522AURA-20261105-1N8B6HYP" + "6304"
	if !strings.HasPrefix(p, want) {
		t.Fatalf("payload\n got %s\nwant %s....", p, want)
	}
	if crc := fmt.Sprintf("%04X", crc16CCITT(p[:len(p)-4])); p[len(p)-4:] != crc {
		t.Fatalf("crc mismatch: %s vs %s", p[len(p)-4:], crc)
	}
	if got := promptPayPayload(5, "R"); !strings.Contains(got, "54040.05") {
		t.Fatalf("small amount formatting: %s", got)
	}
}
