package validate

import "testing"

func TestEmail(t *testing.T) {
	for in, want := range map[string]bool{
		"somchai@auratech.co.th":   true,
		"  Somchai@AuraTech.co.th ": true,
		"a.b+tag@x.io":             true,
		"abc":                      false,
		"abc@":                     false,
		"@x.com":                   false,
		"abc@localhost":            false,
		"abc@x.":                   false,
		"Somchai <s@x.com>":        false,
		"a b@x.com":                false,
		"":                         false,
	} {
		if _, ok := Email(in); ok != want {
			t.Errorf("Email(%q) = %v, want %v", in, ok, want)
		}
	}
	if got, _ := Email("  Somchai@AuraTech.co.th "); got != "somchai@auratech.co.th" {
		t.Errorf("normalised = %q", got)
	}
}
