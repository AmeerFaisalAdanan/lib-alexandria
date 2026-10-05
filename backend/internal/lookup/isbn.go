package lookup

import "strings"

// NormaliseISBN strips separators and upper-cases a trailing X.
func NormaliseISBN(raw string) string {
	return strings.ToUpper(strings.NewReplacer("-", "", " ", "").Replace(strings.TrimSpace(raw)))
}

// Valid reports whether s is a well-formed ISBN-10 or ISBN-13 with a correct check digit.
func Valid(s string) bool {
	switch len(s) {
	case 10:
		sum := 0
		for i := 0; i < 10; i++ {
			c := s[i]
			var v int
			switch {
			case c >= '0' && c <= '9':
				v = int(c - '0')
			case c == 'X' && i == 9:
				v = 10
			default:
				return false
			}
			sum += v * (10 - i)
		}
		return sum%11 == 0
	case 13:
		sum := 0
		for i := 0; i < 13; i++ {
			if s[i] < '0' || s[i] > '9' {
				return false
			}
			d := int(s[i] - '0')
			if i%2 == 1 {
				d *= 3
			}
			sum += d
		}
		return sum%10 == 0 && (strings.HasPrefix(s, "978") || strings.HasPrefix(s, "979"))
	}
	return false
}

// To13 converts a valid ISBN-10 to ISBN-13; an ISBN-13 is returned unchanged.
func To13(s string) string {
	if len(s) != 10 {
		return s
	}
	body := "978" + s[:9]
	sum := 0
	for i := 0; i < 12; i++ {
		d := int(body[i] - '0')
		if i%2 == 1 {
			d *= 3
		}
		sum += d
	}
	return body + string(rune('0'+(10-sum%10)%10))
}
