package sandbox

import (
	"bytes"
	"text/template"
)

// TemplateParams contains the values used to render the lima.yaml template.
type TemplateParams struct {
	Username string
	UID      int
	GID      int
	HomeDir  string
	Mounts   []string
}

// RenderTemplate renders the embedded lima.yaml template with the given parameters.
func RenderTemplate(params TemplateParams) (string, error) {
	tmpl, err := template.New("lima").Parse(string(limaTemplate))
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, params); err != nil {
		return "", err
	}
	return buf.String(), nil
}
