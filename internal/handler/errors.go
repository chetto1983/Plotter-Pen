package handler

import (
	"errors"
	"net/http"
	"unicode"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"plotter-pen/internal/i18n"
)

// respondError answers with the error in Italian, which the page shows, and hands it to the request
// log in English.
func respondError(c *gin.Context, status int, err error) {
	_ = c.Error(err)
	c.JSON(status, gin.H{"error": i18n.Italian(err)})
}

// badRequest answers a body the server cannot read. The fields the binding found missing or wrong
// are named one by one; anything else, such as JSON that does not parse, keeps the detail of the
// parser behind an Italian lead.
func badRequest(c *gin.Context, err error) {
	fields, ok := errors.AsType[validator.ValidationErrors](err)
	if !ok {
		respondError(c, http.StatusBadRequest, i18n.Errorf("invalid request: %w", err))
		return
	}
	problems := make([]error, len(fields))
	for i, f := range fields {
		if f.Tag() == "required" {
			problems[i] = i18n.Errorf("the field %s is required", jsonName(f.Field()))
		} else {
			problems[i] = i18n.Errorf("the field %s is not valid", jsonName(f.Field()))
		}
	}
	respondError(c, http.StatusBadRequest, i18n.Join(problems))
}

// jsonName is the JSON name of a field of the requests, which are the Go name starting in lower
// case: Name is name, Steps is steps.
func jsonName(field string) string {
	r, size := utf8.DecodeRuneInString(field)
	return string(unicode.ToLower(r)) + field[size:]
}
