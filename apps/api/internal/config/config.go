package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// devJWTSecret is the signing key used when JWT_SECRET is not set. It is public (it is in the
// repository), so Validate refuses to start a production server with it.
const devJWTSecret = "aura_tech_local_jwt_secret_key_2026"

// minJWTSecretLength is 32 bytes: the HMAC-SHA256 key size.
const minJWTSecretLength = 32

type Config struct {
	// AppEnv is "development" (default) or "production". Production refuses unsafe settings.
	AppEnv              string
	ProjectName         string
	DatabaseURL         string
	MinIOEndpoint       string
	MinIORootUser       string
	MinIORootPassword   string
	MinIOBucketName     string
	MinIOPublicURL      string
	MinIOUseSSL         bool
	APIPort             string
	JWTSecret           string
	StockLockTTLMinutes int
	WebPort             string
	// CORSAllowedOrigins lists the storefront origins allowed to call the API.
	CORSAllowedOrigins []string
	// TrustProxy reads the client IP from X-Forwarded-For / X-Real-IP. Turn it on only behind a
	// reverse proxy that sets those headers; otherwise clients could fake their IP and dodge
	// rate limits.
	TrustProxy bool
	// SwaggerEnabled serves the API reference at /swagger/. Off by default in production.
	SwaggerEnabled bool
}

func Load() *Config {
	stockTTL, err := strconv.Atoi(getEnv("STOCK_LOCK_TTL_MINUTES", "15"))
	if err != nil {
		stockTTL = 15
	}

	appEnv := strings.ToLower(getEnv("APP_ENV", "development"))
	swaggerDefault := "true"
	if appEnv == "production" {
		swaggerDefault = "false"
	}

	return &Config{
		AppEnv:              appEnv,
		ProjectName:         getEnv("PROJECT_NAME", "aura-tech"),
		DatabaseURL:         getEnv("DATABASE_URL", "postgres://aura_admin:aura_secret_password@localhost:5432/aura_ecommerce?sslmode=disable"),
		MinIOEndpoint:       getEnv("MINIO_ENDPOINT", "localhost:9000"),
		MinIORootUser:       getEnv("MINIO_ROOT_USER", "minioadmin"),
		MinIORootPassword:   getEnv("MINIO_ROOT_PASSWORD", "minioadminpassword"),
		MinIOBucketName:     getEnv("MINIO_BUCKET_NAME", "aura-assets"),
		MinIOPublicURL:      getEnv("MINIO_PUBLIC_URL", "http://localhost:9000/aura-assets"),
		MinIOUseSSL:         getEnv("MINIO_USE_SSL", "false") == "true",
		APIPort:             getEnv("API_PORT", "8080"),
		JWTSecret:           getEnv("JWT_SECRET", devJWTSecret),
		StockLockTTLMinutes: stockTTL,
		WebPort:             getEnv("WEB_PORT", "5173"),
		CORSAllowedOrigins:  splitList(getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000")),
		TrustProxy:          getEnv("TRUST_PROXY", "false") == "true",
		SwaggerEnabled:      getEnv("SWAGGER_ENABLED", swaggerDefault) == "true",
	}
}

// IsProduction reports whether the server runs with APP_ENV=production.
func (c *Config) IsProduction() bool { return c.AppEnv == "production" }

// Validate refuses settings that are only safe on a developer machine. In development it
// accepts everything, so the project still starts with no .env at all.
func (c *Config) Validate() error {
	if c.AppEnv != "development" && c.AppEnv != "production" {
		return fmt.Errorf("APP_ENV must be development or production, got %q", c.AppEnv)
	}
	if !c.IsProduction() {
		return nil
	}
	var problems []error
	if c.JWTSecret == devJWTSecret {
		problems = append(problems, errors.New("JWT_SECRET is the development key from the repository; set a random secret (openssl rand -base64 48)"))
	} else if len(c.JWTSecret) < minJWTSecretLength {
		problems = append(problems, fmt.Errorf("JWT_SECRET must be at least %d characters", minJWTSecretLength))
	}
	if len(c.CORSAllowedOrigins) == 0 {
		problems = append(problems, errors.New("CORS_ALLOWED_ORIGINS must list the storefront origin(s)"))
	}
	for _, o := range c.CORSAllowedOrigins {
		if o == "*" {
			problems = append(problems, errors.New("CORS_ALLOWED_ORIGINS cannot be * in production"))
		} else if strings.HasPrefix(o, "http://") {
			problems = append(problems, fmt.Errorf("CORS origin %q must use https in production", o))
		}
	}
	return errors.Join(problems...)
}

func splitList(s string) []string {
	var out []string
	for _, part := range strings.Split(s, ",") {
		if part = strings.TrimSpace(part); part != "" {
			out = append(out, strings.TrimRight(part, "/"))
		}
	}
	return out
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
