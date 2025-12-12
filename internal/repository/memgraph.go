package repository

import (
	"context"
	"fmt"
	"hollyweb/internal/domain"

	"github.com/neo4j/neo4j-go-driver/v6/neo4j"
)

type MemgraphRepository struct {
	driver neo4j.Driver
}

func NewMemgraphRepository(uri, user, password string) (*MemgraphRepository, error) {
	driver, err := neo4j.NewDriver(uri, neo4j.BasicAuth(user, password, ""))
	if err != nil {
		return nil, fmt.Errorf("failed to create driver: %w", err)
	}

	return &MemgraphRepository{
		driver: driver,
	}, nil
}

func (r *MemgraphRepository) Ping(ctx context.Context) error {
	return r.driver.VerifyConnectivity(ctx)
}

func (r *MemgraphRepository) Close(ctx context.Context) error {
	return r.driver.Close(ctx)
}

func (r *MemgraphRepository) CreatePerson(ctx context.Context, person *domain.Person) error {
	query := `
		CALL uuid_generator.get() YIELD uuid
		CREATE (p:Person {id: uuid, name: $name})
		RETURN p.id as id
	`

	params := map[string]any{
		"name": person.Name,
	}

	result, err := neo4j.ExecuteQuery(ctx, r.driver, query, params,
		neo4j.EagerResultTransformer,
		neo4j.ExecuteQueryWithDatabase(""))

	if err != nil {
		return fmt.Errorf("failed to create person: %w", err)
	}

	if len(result.Records) > 0 {
		id, ok := result.Records[0].Get("id")
		if ok {
			person.ID = id.(string)
		}
	}

	return nil
}

func (r *MemgraphRepository) GetPersonByID(ctx context.Context, id string) (*domain.Person, error) {
	query := `
		MATCH (p:Person {id: $id})
		RETURN p.id as id, p.name as name
	`

	params := map[string]any{"id": id}

	result, err := neo4j.ExecuteQuery(ctx, r.driver, query, params,
		neo4j.EagerResultTransformer,
		neo4j.ExecuteQueryWithDatabase(""))

	if err != nil {
		return nil, fmt.Errorf("failed to get person: %w", err)
	}

	if len(result.Records) == 0 {
		return nil, fmt.Errorf("person not found with id: %s", id)
	}

	return recordToPerson(result.Records[0])
}

func (r *MemgraphRepository) GetPersonByName(ctx context.Context, name string) (*domain.Person, error) {
	query := `
		MATCH (p:Person {name: $name})
		RETURN p.id as id, p.name as name
	`

	params := map[string]any{"name": name}

	result, err := neo4j.ExecuteQuery(ctx, r.driver, query, params,
		neo4j.EagerResultTransformer,
		neo4j.ExecuteQueryWithDatabase(""))

	if err != nil {
		return nil, fmt.Errorf("failed to get person: %w", err)
	}

	if len(result.Records) == 0 {
		return nil, fmt.Errorf("person not found with name: %s", name)
	}

	return recordToPerson(result.Records[0])
}

func (r *MemgraphRepository) CreateMovie(ctx context.Context, movie *domain.Movie) error {
	query := `
		CALL uuid_generator.get() YIELD uuid
		CREATE (m:Movie {
			id: uuid,
			title: $title,
			releaseYear: $releaseYear,
		})
		RETURN m.id as id
	`

	params := map[string]any{
		"title":       movie.Title,
		"releaseYear": movie.ReleaseYear,
	}

	result, err := neo4j.ExecuteQuery(ctx, r.driver, query, params,
		neo4j.EagerResultTransformer,
		neo4j.ExecuteQueryWithDatabase(""))

	if err != nil {
		return fmt.Errorf("failed to create movie: %w", err)
	}

	if len(result.Records) > 0 {
		id, ok := result.Records[0].Get("id")
		if ok {
			movie.ID = id.(string)
		}
	}

	return nil
}

func (r *MemgraphRepository) GetMovieByID(ctx context.Context, id string) (*domain.Movie, error) {
	query := `
		MATCH (m:Movie {id: $id})
		RETURN m.id as id, m.title as title, m.releaseYear as releaseYear
	`

	params := map[string]any{"id": id}

	result, err := neo4j.ExecuteQuery(ctx, r.driver, query, params,
		neo4j.EagerResultTransformer,
		neo4j.ExecuteQueryWithDatabase(""))

	if err != nil {
		return nil, fmt.Errorf("failed to get movie: %w", err)
	}

	if len(result.Records) == 0 {
		return nil, fmt.Errorf("movie not found with id: %s", id)
	}

	return recordToMovie(result.Records[0])
}

func (r *MemgraphRepository) GetMovieByTitle(ctx context.Context, title string) (*domain.Movie, error) {
	query := `
		MATCH (m:Movie {title: $title})
		RETURN m.id as id, m.title as title, m.releaseYear as releaseYear`

	params := map[string]any{"title": title}

	result, err := neo4j.ExecuteQuery(ctx, r.driver, query, params,
		neo4j.EagerResultTransformer,
		neo4j.ExecuteQueryWithDatabase(""))

	if err != nil {
		return nil, fmt.Errorf("failed to get movie: %w", err)
	}

	if len(result.Records) == 0 {
		return nil, fmt.Errorf("movie not found with title: %s", title)
	}

	return recordToMovie(result.Records[0])
}

func (r *MemgraphRepository) CreateRelationship(ctx context.Context, fromID, toID string, relType domain.RelationType, props map[string]any) error {
	query := fmt.Sprintf(`
		MATCH (from {id: $fromID})
		MATCH (to {id: $toID})
		CREATE (from)-[r:%s]->(to)
		RETURN r
	`, relType)

	params := map[string]any{
		"fromID": fromID,
		"toID":   toID,
	}

	for k, v := range props {
		params[k] = v
	}

	_, err := neo4j.ExecuteQuery(ctx, r.driver, query, params,
		neo4j.EagerResultTransformer,
		neo4j.ExecuteQueryWithDatabase(""))

	if err != nil {
		return fmt.Errorf("failed to create relationship: %w", err)
	}

	return nil
}

func (r *MemgraphRepository) FindMoviesByActor(ctx context.Context, actorName string) ([]*domain.Movie, error) {
	query := `
		MATCH (p:Person {name: $actorName})-[:ACTED_IN]->(m:Movie)
		RETURN m.id as id, m.title as title, m.releaseYear as releaseYear
		ORDER BY m.releaseYear DESC
		`

	params := map[string]any{"actorName": actorName}

	result, err := neo4j.ExecuteQuery(ctx, r.driver, query, params,
		neo4j.EagerResultTransformer,
		neo4j.ExecuteQueryWithDatabase(""))

	if err != nil {
		return nil, fmt.Errorf("failed to find movies: %w", err)
	}

	movies := make([]*domain.Movie, 0, len(result.Records))
	for _, record := range result.Records {
		movie, err := recordToMovie(record)
		if err != nil {
			return nil, err
		}
		movies = append(movies, movie)
	}

	return movies, nil
}

func (r *MemgraphRepository) FindActorsByMovie(ctx context.Context, movieTitle string) ([]*domain.Person, error) {
	query := `
		MATCH (p:Person)-[:ACTED_IN]->(m:Movie {title: $movieTitle})
		RETURN p.id as id, p.name as name
		ORDER BY p.name
	`

	params := map[string]any{"movieTitle": movieTitle}

	result, err := neo4j.ExecuteQuery(ctx, r.driver, query, params,
		neo4j.EagerResultTransformer,
		neo4j.ExecuteQueryWithDatabase(""))

	if err != nil {
		return nil, fmt.Errorf("failed to find actors: %w", err)
	}

	persons := make([]*domain.Person, 0, len(result.Records))
	for _, record := range result.Records {
		person, err := recordToPerson(record)
		if err != nil {
			return nil, err
		}
		persons = append(persons, person)
	}

	return persons, nil
}

func recordToPerson(record *neo4j.Record) (*domain.Person, error) {
	id, _ := record.Get("id")
	name, _ := record.Get("name")

	person := &domain.Person{
		ID:   id.(string),
		Name: name.(string),
	}

	return person, nil
}

func recordToMovie(record *neo4j.Record) (*domain.Movie, error) {
	id, _ := record.Get("id")
	title, _ := record.Get("title")
	releaseYear, _ := record.Get("releaseYear")

	movie := &domain.Movie{
		ID:          id.(string),
		Title:       title.(string),
		ReleaseYear: int(releaseYear.(int64)),
	}

	return movie, nil
}
