package graph

import (
	"context"
	"log"
	"os"

	"github.com/neo4j/neo4j-go-driver/v6/neo4j"
)

func Connect() (neo4j.Driver, error) {
	dbUri := os.Getenv("DB_URI")
	dbUser := os.Getenv("DB_USER")
	dbPassword := os.Getenv("DB_PASSWORD")

	driver, err := neo4j.NewDriver(dbUri, neo4j.BasicAuth(dbUser, dbPassword, ""))
	if err != nil {
		return nil, err
	}

	ctx := context.Background()

	if err = driver.VerifyConnectivity(ctx); err != nil {
		return nil, err
	}
	log.Println("Conntected to database...")
	return driver, nil
}

func Close(driver neo4j.Driver) error {
	if driver != nil {
		ctx := context.Background()
		return driver.Close(ctx)
	} else {
		log.Println("Tried to close driver but driver was not found...")
	}
	return nil
}
