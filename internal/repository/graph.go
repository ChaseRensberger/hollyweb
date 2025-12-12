package repository

import (
	"context"
	"hollyweb/internal/domain"
)

type GraphRepository interface {
	CreatePerson(ctx context.Context, person *domain.Person) error
	GetPersonByID(ctx context.Context, id string) (*domain.Person, error)
	GetPersonByName(ctx context.Context, name string) (*domain.Person, error)

	CreateMovie(ctx context.Context, movie *domain.Movie) error
	GetMovieByID(ctx context.Context, id string) (*domain.Movie, error)
	GetMovieByTitle(ctx context.Context, title string) (*domain.Movie, error)

	CreateRelationship(ctx context.Context, fromID, toID string, relType domain.RelationType, props map[string]any) error

	FindMoviesByActor(ctx context.Context, actorName string) ([]*domain.Movie, error)
	FindActorsByMovie(ctx context.Context, movieTitle string) ([]*domain.Person, error)

	Close(ctx context.Context) error
	Ping(ctx context.Context) error
}
