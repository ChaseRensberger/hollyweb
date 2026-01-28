package main

import (
	"encoding/xml"
	"net/http"
	"time"

	"github.com/joho/godotenv"
	"github.com/labstack/echo/v5"
	"github.com/labstack/echo/v5/middleware"
)

type Enclosure struct {
	XMLName xml.Name `xml:"enclosure"`
	URL     string   `xml:"url,attr"`
	Type    string   `xml:"type,attr"`
}

type Item struct {
	XMLName     xml.Name    `xml:"item"`
	GUID        string      `xml:"guid"`
	ID          int         `xml:"id"`
	Title       string      `xml:"title"`
	PubDate     string      `xml:"pubDate"`
	Description string      `xml:"description"`
	Content     string      `xml:"content:encoded"`
	Enclosures  []Enclosure `xml:"enclosure"`
}

type Channel struct {
	XMLName xml.Name `xml:"channel"`
	Title   string   `xml:"title"`
	Link    string   `xml:"link"`
	Items   []Item   `xml:"item"`
}

type RSS struct {
	XMLName xml.Name `xml:"rss"`
	Version string   `xml:"version,attr"`
	Content string   `xml:"xmlns:content,attr"`
	Channel Channel  `xml:"channel"`
}

func getSampleEpisodes() RSS {
	baseTime := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)

	return RSS{
		Version: "2.0",
		Content: "http://purl.org/rss/1.0/modules/content/",
		Channel: Channel{
			Title: "My Podcast",
			Link:  "http://localhost:1323",
			Items: []Item{
				{
					GUID:        "1",
					ID:          1,
					Title:       "Guam is sinking!",
					PubDate:     baseTime.Format(time.RFC1123Z),
					Description: "Oh no that can't be good.",
					Content:     "<p>Guam is sinking! that cant be good</p>",
					Enclosures: []Enclosure{
						{
							URL:  "https://hollyweb.s3.us-east-1.amazonaws.com/episode1.wav",
							Type: "audio/wav",
						},
					},
				},
				{
					GUID:        "2",
					ID:          2,
					Title:       "Oscar Nominations (ft. Justin Johnson)",
					PubDate:     baseTime.AddDate(0, 0, 7).Format(time.RFC1123Z),
					Description: "Justin joins us to talk about Wishing Well and Gunston Road.",
					Content:     "<p>Oscar Nominations (ft. Justin Johnson)</p>",
					Enclosures: []Enclosure{
						{
							URL:  "https://hollyweb.s3.us-east-1.amazonaws.com/episode2.wav",
							Type: "audio/wav",
						},
					},
				},
			},
		},
	}
}

func main() {
	godotenv.Load(".env.local")
	e := echo.New()
	e.Use(middleware.RequestLogger())
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"*"},
	}))

	e.GET("/", func(c *echo.Context) error {
		return c.String(http.StatusOK, "Hello, World!")
	})

	e.GET("/api/feed", func(c *echo.Context) error {
		feed := getSampleEpisodes()
		c.Response().Header().Set("Content-Type", "application/rss+xml; charset=utf-8")
		return c.XMLPretty(http.StatusOK, feed, "  ")
	})

	if err := e.Start(":1323"); err != nil {
		e.Logger.Error("failed to start server", "error", err)
	}
}
