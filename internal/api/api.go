package api

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"hollyweb/internal/graph"

	"github.com/joho/godotenv"
	"github.com/labstack/echo/v4"
	"github.com/neo4j/neo4j-go-driver/v6/neo4j"
)

type QueryRequest struct {
	Query string `json:"query"`
}

type QueryResponse struct {
	Cypher  string `json:"cypher"`
	Results []any  `json:"results"`
}

func Run() {
	godotenv.Load(".env.local")
	driver, err := graph.Connect()
	if err != nil {
		log.Fatal("Failed to connect to database: ", err)
	}
	defer graph.Close(driver)

	e := echo.New()
	e.GET("/", func(c echo.Context) error {
		return c.String(http.StatusOK, "Hollyweb!")
	})
	e.POST("/query", func(c echo.Context) error {
		return handleQuery(c, driver)
	})
	go func() {
		if err := e.Start(fmt.Sprintf(":%v", os.Getenv("SERVER_PORT"))); err != nil && err != http.ErrServerClosed {
			e.Logger.Fatal(err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	<-quit

	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	if err := e.Shutdown(ctx); err != nil {
		e.Logger.Fatal(err)
	}
}

func handleQuery(c echo.Context, driver neo4j.Driver) error {
	var req QueryRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}
	cypherQuery := "MATCH (m:Movie) RETURN m LIMIT 10"
	ctx := context.Background()
	session := driver.NewSession(ctx, neo4j.SessionConfig{})
	defer session.Close(ctx)
	result, err := session.Run(ctx, cypherQuery, nil)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
	}
	var results []any
	for result.Next(ctx) {
		record := result.Record()
		recordMap := make(map[string]any)
		for i, key := range record.Keys {
			recordMap[key] = record.Values[i]
		}
		results = append(results, recordMap)
	}
	if err = result.Err(); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
	}
	response := QueryResponse{
		Cypher:  cypherQuery,
		Results: results,
	}
	return c.JSON(http.StatusOK, response)
}
