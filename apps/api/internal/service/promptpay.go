package service

import (
	"fmt"
	"strings"
)

// promptPayProxy is the PromptPay ID the QR pays to. It is a phone-number proxy that no bank
// account is registered to, so a banking app that scans the code shows the recipient as not
// found and no transfer can be made; payment is confirmed in checkout instead.
const promptPayProxy = "0066000000000"

// promptPayPayload builds a Thai QR Payment (EMVCo) payload for a one-time PromptPay transfer of
// exactly amountSatang, carrying the order number as the bill reference.
func promptPayPayload(amountSatang int64, reference string) string {
	merchant := tlv("00", "A000000677010111") + tlv("01", promptPayProxy)
	var b strings.Builder
	b.WriteString(tlv("00", "01"))     // payload format indicator
	b.WriteString(tlv("01", "12"))     // dynamic QR: valid for this payment only
	b.WriteString(tlv("29", merchant)) // PromptPay merchant account
	b.WriteString(tlv("53", "764"))    // currency: THB
	b.WriteString(tlv("54", fmt.Sprintf("%d.%02d", amountSatang/100, amountSatang%100)))
	b.WriteString(tlv("58", "TH"))                 // country
	b.WriteString(tlv("62", tlv("05", reference))) // additional data: bill reference
	b.WriteString("6304")                          // CRC tag and length; the CRC covers them too
	return b.String() + fmt.Sprintf("%04X", crc16CCITT(b.String()))
}

func tlv(tag, value string) string {
	return fmt.Sprintf("%s%02d%s", tag, len(value), value)
}

// crc16CCITT is CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), the checksum Thai QR requires.
func crc16CCITT(s string) uint16 {
	crc := uint16(0xFFFF)
	for i := 0; i < len(s); i++ {
		crc ^= uint16(s[i]) << 8
		for bit := 0; bit < 8; bit++ {
			if crc&0x8000 != 0 {
				crc = crc<<1 ^ 0x1021
			} else {
				crc <<= 1
			}
		}
	}
	return crc
}
