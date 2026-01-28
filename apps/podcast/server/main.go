package main

import (
	"encoding/xml"
	"net/http"
	"time"

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
	baseTime := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)

	return RSS{
		Version: "2.0",
		Content: "http://purl.org/rss/1.0/modules/content/",
		Channel: Channel{
			Title: "My Podcast",
			Link:  "http://localhost:1323",
			Items: []Item{
				{
					ID:          1,
					Title:       "Welcome to the Podcast",
					PubDate:     baseTime.Format(time.RFC1123Z),
					Description: "In our first episode, we introduce the show and discuss what's to come.",
					Content:     "<p>Welcome to our podcast! In this inaugural episode, we're excited to share our vision and what listeners can expect in future episodes. We'll be covering technology, innovation, and the stories behind great ideas.</p>",
					Enclosures: []Enclosure{
						{
							URL:  "https://example.com/episodes/episode-1.mp3",
							Type: "audio/mpeg",
						},
					},
				},
				{
					ID:          2,
					Title:       "The Future of Web Development",
					PubDate:     baseTime.AddDate(0, 0, 7).Format(time.RFC1123Z),
					Description: "We explore emerging trends in web development and what they mean for developers.",
					Content:     "<p>This week, we dive deep into the future of web development. From new frameworks to evolving best practices, we discuss how the landscape is changing and what developers need to know to stay ahead.</p>",
					Enclosures: []Enclosure{
						{
							URL:  "https://example.com/episodes/episode-2.mp3",
							Type: "audio/mpeg",
						},
					},
				},
				{
					ID:          3,
					Title:       "Building Scalable Systems",
					PubDate:     baseTime.AddDate(0, 0, 14).Format(time.RFC1123Z),
					Description: "A deep dive into architectural patterns for building systems that scale.",
					Content:     "<p>Scalability is crucial for modern applications. In this episode, we break down the key architectural patterns and principles that enable systems to grow gracefully, from microservices to distributed databases.</p>",
					Enclosures: []Enclosure{
						{
							URL:  "https://example.com/episodes/episode-3.mp3",
							Type: "audio/mpeg",
						},
					},
				},
			},
		},
	}
}

func main() {
	e := echo.New()
	e.Use(middleware.RequestLogger())
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"http://localhost:3000", "http://localhost:3001"},
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
