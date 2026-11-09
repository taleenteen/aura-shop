package config

import (
	"strings"
	"testing"
)

func prodConfig() *Config {
	return &Config{
		AppEnv:             "production",
		JWTSecret:          strings.Repeat("k", minJWTSecretLength),
		CORSAllowedOrigins: []string{"https://shop.example.com"},
	}
}

func TestValidateAcceptsDevelopmentDefaults(t *testing.T) {
	c := &Config{AppEnv: "development", JWTSecret: devJWTSecret, CORSAllowedOrigins: []string{"http://localhost:5173"}}
	if err := c.Validate(); err != nil {
		t.Fatalf("development defaults rejected: %v", err)
	}
}

func TestValidateProduction(t *testing.T) {
	cases := map[string]struct {
		edit    func(*Config)
		wantErr string
	}{
		"valid":           {edit: func(*Config) {}},
		"dev secret":      {edit: func(c *Config) { c.JWTSecret = devJWTSecret }, wantErr: "development key"},
		"short secret":    {edit: func(c *Config) { c.JWTSecret = "short" }, wantErr: "at least 32"},
		"no origins":      {edit: func(c *Config) { c.CORSAllowedOrigins = nil }, wantErr: "CORS_ALLOWED_ORIGINS must list"},
		"wildcard origin": {edit: func(c *Config) { c.CORSAllowedOrigins = []string{"*"} }, wantErr: "cannot be *"},
		"plain http":      {edit: func(c *Config) { c.CORSAllowedOrigins = []string{"http://shop.example.com"} }, wantErr: "must use https"},
		"unknown app env": {edit: func(c *Config) { c.AppEnv = "prod" }, wantErr: "APP_ENV must be"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			c := prodConfig()
			tc.edit(c)
			err := c.Validate()
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("error = %v, want it to mention %q", err, tc.wantErr)
			}
		})
	}
}

func TestSplitList(t *testing.T) {
	got := splitList(" https://a.com/ , ,https://b.com")
	if len(got) != 2 || got[0] != "https://a.com" || got[1] != "https://b.com" {
		t.Fatalf("splitList = %#v", got)
	}
}
