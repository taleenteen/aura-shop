package config

import (
	"os"
	"strconv"
)

type Config struct {
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
}

func Load() *Config {
	stockTTL, err := strconv.Atoi(getEnv("STOCK_LOCK_TTL_MINUTES", "15"))
	if err != nil {
		stockTTL = 15
	}

	useSSL := getEnv("MINIO_USE_SSL", "false") == "true"

	return &Config{
		ProjectName:         getEnv("PROJECT_NAME", "aura-tech"),
		DatabaseURL:         getEnv("DATABASE_URL", "postgres://aura_admin:aura_secret_password@localhost:5432/aura_ecommerce?sslmode=disable"),
		MinIOEndpoint:       getEnv("MINIO_ENDPOINT", "localhost:9000"),
		MinIORootUser:       getEnv("MINIO_ROOT_USER", "minioadmin"),
		MinIORootPassword:   getEnv("MINIO_ROOT_PASSWORD", "minioadminpassword"),
		MinIOBucketName:     getEnv("MINIO_BUCKET_NAME", "aura-assets"),
		MinIOPublicURL:      getEnv("MINIO_PUBLIC_URL", "http://localhost:9000/aura-assets"),
		MinIOUseSSL:         useSSL,
		APIPort:             getEnv("API_PORT", "8080"),
		JWTSecret:           getEnv("JWT_SECRET", "aura_tech_local_jwt_secret_key_2026"),
		StockLockTTLMinutes: stockTTL,
		WebPort:             getEnv("WEB_PORT", "5173"),
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
