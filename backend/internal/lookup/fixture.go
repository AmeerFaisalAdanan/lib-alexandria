package lookup

import "context"

// Fixture is a canned lookup and cover reader for development and tests (config refuses it in production).
// It never touches the network.
type Fixture struct{}

func year(y int) *int { return &y }

var fixtureBooks = map[string]Info{
	"9780132350884": {Title: "Clean Code: A Handbook of Agile Software Craftsmanship", Author: "Robert C. Martin", Publisher: "Prentice Hall", PublicationYear: year(2008), Language: "English", Category: "Technology & Software"},
	"9780201616224": {Title: "The Pragmatic Programmer", Author: "Andrew Hunt, David Thomas", Publisher: "Addison-Wesley", PublicationYear: year(1999), Language: "English", Category: "Technology & Software"},
}

func (Fixture) ByISBN(_ context.Context, isbn string) (Info, bool, error) {
	info, ok := fixtureBooks[isbn]
	if ok {
		info.ISBN = isbn
	}
	return info, ok, nil
}

// Read pretends to read any cover as The Pragmatic Programmer, so end-to-end tests are deterministic.
func (Fixture) Read(context.Context, []byte, string) (Info, error) {
	info := fixtureBooks["9780201616224"]
	info.ISBN = ""
	return info, nil
}
