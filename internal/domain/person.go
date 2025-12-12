package domain

type Person struct {
	ID   string
	Name string
}

func NewPerson(name string) *Person {
	return &Person{
		Name: name,
	}
}
