// Package validate holds input checks shared by handlers and services.
package validate

import (
	"net/mail"
	"strings"
)

// Email trims and lowercases an address and reports whether it is a plain, deliverable-looking
// address: exactly "local@domain" (no display name or angle brackets), a dot in the domain,
// and at most 254 characters.
func Email(s string) (string, bool) {
	e := strings.ToLower(strings.TrimSpace(s))
	if e == "" || len(e) > 254 || strings.ContainsAny(e, " <>\"") {
		return e, false
	}
	addr, err := mail.ParseAddress(e)
	if err != nil || addr.Address != e || addr.Name != "" {
		return e, false
	}
	at := strings.LastIndexByte(e, '@')
	domain := e[at+1:]
	if at < 1 || !strings.Contains(domain, ".") || strings.HasPrefix(domain, ".") || strings.HasSuffix(domain, ".") {
		return e, false
	}
	return e, true
}
