package domain

type Movie struct {
	ID          string
	Title       string
	ReleaseYear int
}

func NewMovie(title string, releaseYear int) *Movie {
	return &Movie{
		Title:       title,
		ReleaseYear: releaseYear,
	}
}
