package lima

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/averycrespi/claudefiles/orchestrator/internal/exec"
)

type mockRunner struct {
	mock.Mock
}

func (m *mockRunner) Run(name string, args ...string) ([]byte, error) {
	callArgs := m.Called(name, args)
	return callArgs.Get(0).([]byte), callArgs.Error(1)
}

func (m *mockRunner) RunDir(dir, name string, args ...string) ([]byte, error) {
	callArgs := m.Called(dir, name, args)
	return callArgs.Get(0).([]byte), callArgs.Error(1)
}

func (m *mockRunner) RunInteractive(name string, args ...string) error {
	callArgs := m.Called(name, args)
	return callArgs.Error(0)
}

var _ exec.Runner = (*mockRunner)(nil)

func TestClient_Status_Running(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "limactl", []string{"list", "--json"}).Return([]byte("{\"name\":\"cco-sandbox\",\"status\":\"Running\"}\n"), nil)

	client := NewClient(r)
	status, err := client.Status()

	require.NoError(t, err)
	assert.Equal(t, "Running", status)
}

func TestClient_Status_NotFound(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "limactl", []string{"list", "--json"}).Return([]byte(""), nil)

	client := NewClient(r)
	status, err := client.Status()

	require.NoError(t, err)
	assert.Equal(t, "", status)
}

func TestClient_Status_OtherVMsOnly(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "limactl", []string{"list", "--json"}).Return([]byte("{\"name\":\"other-vm\",\"status\":\"Running\"}\n"), nil)

	client := NewClient(r)
	status, err := client.Status()

	require.NoError(t, err)
	assert.Equal(t, "", status)
}

func TestClient_Create(t *testing.T) {
	r := new(mockRunner)
	r.On("RunInteractive", "limactl", []string{"start", "--name=" + VMName, "/tmp/template.yaml"}).Return(nil)

	client := NewClient(r)
	err := client.Create("/tmp/template.yaml")

	require.NoError(t, err)
	r.AssertExpectations(t)
}

func TestClient_Start(t *testing.T) {
	r := new(mockRunner)
	r.On("RunInteractive", "limactl", []string{"start", VMName}).Return(nil)

	client := NewClient(r)
	err := client.Start()

	require.NoError(t, err)
}

func TestClient_Stop(t *testing.T) {
	r := new(mockRunner)
	r.On("RunInteractive", "limactl", []string{"stop", VMName}).Return(nil)

	client := NewClient(r)
	err := client.Stop()

	require.NoError(t, err)
}

func TestClient_Delete(t *testing.T) {
	r := new(mockRunner)
	r.On("RunInteractive", "limactl", []string{"delete", VMName}).Return(nil)

	client := NewClient(r)
	err := client.Delete()

	require.NoError(t, err)
}

func TestClient_Copy(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "limactl", []string{"cp", "/tmp/file", VMName + ":~/.config/file"}).Return([]byte(""), nil)

	client := NewClient(r)
	err := client.Copy("/tmp/file", "~/.config/file")

	require.NoError(t, err)
}

func TestParseStatus_InvalidJSON(t *testing.T) {
	_, err := parseStatus([]byte(`not json`))
	assert.Error(t, err)
}
