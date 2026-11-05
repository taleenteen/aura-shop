package service

import "testing"

func TestPublicName(t *testing.T) {
	for in, want := range map[string]string{
		"Somchai Prommin":       "Somchai P.",
		"Nok":                   "Nok",
		"  ":                    "Verified buyer",
		"สมชาย ใจดี":            "สมชาย ใ.",
		"Anna Maria de la Cruz": "Anna C.",
	} {
		if got := publicName(in); got != want {
			t.Errorf("publicName(%q) = %q, want %q", in, got, want)
		}
	}
}
