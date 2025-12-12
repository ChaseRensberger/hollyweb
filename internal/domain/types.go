package domain

type RelationType string

const (
	RelActedIn  RelationType = "ACTED_IN"
	RelDirected RelationType = "DIRECTED"
	RelWrote    RelationType = "WROTE"
)
