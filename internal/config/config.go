package config

import (
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	DBUri      string
	DBUser     string
	DBPassword string
	ServerPort string
}

func Load() (*Config, error) {
	godotenv.Load(".env.local")

	cfg := &Config{
		DBUri:      os.Getenv("DB_URI"),
		DBUser:     os.Getenv("DB_USER"),
		DBPassword: os.Getenv("DB_PASSWORD"),
		ServerPort: os.Getenv("SERVER_PORT"),
	}

	return cfg, nil
}
