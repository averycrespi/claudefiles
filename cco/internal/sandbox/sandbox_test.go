package sandbox

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/averycrespi/claudefiles/cco/internal/config"
	"github.com/averycrespi/claudefiles/cco/internal/logging"
)

// mockLimaClient implements limaClient for tests.
type mockLimaClient struct {
	mock.Mock
}

func (m *mockLimaClient) Status() (string, error) {
	args := m.Called()
	return args.String(0), args.Error(1)
}

func (m *mockLimaClient) Create(templatePath string) error {
	args := m.Called(templatePath)
	return args.Error(0)
}

func (m *mockLimaClient) Start() error {
	args := m.Called()
	return args.Error(0)
}

func (m *mockLimaClient) Stop() error {
	args := m.Called()
	return args.Error(0)
}

func (m *mockLimaClient) Delete() error {
	args := m.Called()
	return args.Error(0)
}

func (m *mockLimaClient) Copy(src, dst string) error {
	args := m.Called(src, dst)
	return args.Error(0)
}

func (m *mockLimaClient) Shell(args ...string) error {
	callArgs := []interface{}{}
	for _, a := range args {
		callArgs = append(callArgs, a)
	}
	return m.Called(callArgs...).Error(0)
}

// --- Embedded file tests ---

func TestEmbeddedLimaTemplate_NotEmpty(t *testing.T) {
	assert.NotEmpty(t, limaTemplate)
}

func TestEmbeddedLimaTemplate_ContainsExpectedContent(t *testing.T) {
	content := string(limaTemplate)
	assert.Contains(t, content, "minimumLimaVersion")
	assert.Contains(t, content, "ubuntu-24.04")
}

func TestEmbeddedLimaTemplate_ContainsTemplateVars(t *testing.T) {
	content := string(limaTemplate)
	assert.Contains(t, content, "{{.Username}}")
	assert.Contains(t, content, "{{.UID}}")
	assert.Contains(t, content, "{{.GID}}")
	assert.Contains(t, content, "{{.HomeDir}}")
	assert.Contains(t, content, ".Mounts")
}

// --- Service lifecycle tests ---

func TestService_Start_NotCreated(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("", nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Start()

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "sandbox not created")
}

func TestService_Start_AlreadyRunning(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Start()

	require.NoError(t, err)
}

func TestService_Start_Stopped(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Stopped", nil)
	lima.On("Start").Return(nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Start()

	require.NoError(t, err)
	lima.AssertCalled(t, "Start")
}

func TestService_Stop_NotCreated(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("", nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Stop()

	require.NoError(t, err)
	lima.AssertNotCalled(t, "Stop")
}

func TestService_Stop_AlreadyStopped(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Stopped", nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Stop()

	require.NoError(t, err)
	lima.AssertNotCalled(t, "Stop")
}

func TestService_Stop_Running(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Stop").Return(nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Stop()

	require.NoError(t, err)
	lima.AssertCalled(t, "Stop")
}

func TestService_Destroy_NotCreated(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("", nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Destroy()

	require.NoError(t, err)
	lima.AssertNotCalled(t, "Delete")
}

func TestService_Destroy_Exists(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Delete").Return(nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Destroy()

	require.NoError(t, err)
	lima.AssertCalled(t, "Delete")
}

func TestService_Status_NotCreated(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("", nil)
	svc := NewService(lima, logging.NoopLogger{})

	status, err := svc.StatusString()

	require.NoError(t, err)
	assert.Equal(t, "NotCreated", status)
}

func TestService_Status_Running(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	svc := NewService(lima, logging.NoopLogger{})

	status, err := svc.StatusString()

	require.NoError(t, err)
	assert.Equal(t, "Running", status)
}

func TestService_Shell_NotCreated(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("", nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Shell()

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "sandbox not created")
}

func TestService_Shell_Stopped(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Stopped", nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Shell()

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "sandbox not running")
}

func TestService_Shell_Running(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Shell").Return(nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Shell()

	require.NoError(t, err)
	lima.AssertCalled(t, "Shell")
}

func TestService_Shell_WithArgs(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Shell", "ls", "-la").Return(nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Shell("ls", "-la")

	require.NoError(t, err)
	lima.AssertCalled(t, "Shell", "ls", "-la")
}

// --- Provision tests ---

func TestService_Provision_NotCreated(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("", nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Provision(config.SandboxConfig{})

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "sandbox not created")
}

func TestService_Provision_Stopped(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Stopped", nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Provision(config.SandboxConfig{})

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "sandbox not running")
}

func TestService_Provision_Running_NoPaths(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Provision(config.SandboxConfig{})

	require.NoError(t, err)
	lima.AssertNotCalled(t, "Copy", mock.Anything, mock.Anything)
}

func TestService_Provision_Running_WithPaths(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Shell", mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return(nil)
	lima.On("Copy", mock.Anything, mock.Anything).Return(nil)
	svc := NewService(lima, logging.NoopLogger{})

	cfg := config.SandboxConfig{
		ProvisionPaths: []string{
			"/Users/me/.claude",
			"/Users/me/.zshrc",
		},
	}
	err := svc.Provision(cfg)

	require.NoError(t, err)
	// Each provision path triggers a copy
	lima.AssertCalled(t, "Copy", "/Users/me/.claude", "/Users/me/.claude")
	lima.AssertCalled(t, "Copy", "/Users/me/.zshrc", "/Users/me/.zshrc")
}

func TestService_Provision_Running_WithMappedPaths(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Shell", mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return(nil)
	lima.On("Copy", mock.Anything, mock.Anything).Return(nil)
	svc := NewService(lima, logging.NoopLogger{})

	cfg := config.SandboxConfig{
		ProvisionPaths: []string{
			"/Users/me/.claude/sandbox/settings.json:/Users/me/.claude/settings.json",
		},
	}
	err := svc.Provision(cfg)

	require.NoError(t, err)
	lima.AssertCalled(t, "Copy", "/Users/me/.claude/sandbox/settings.json", "/Users/me/.claude/settings.json")
}

// --- Create tests ---

func TestService_Create_AlreadyRunning(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Create(TemplateParams{Username: "test", UID: 1000, GID: 1000, HomeDir: "/home/test"}, config.SandboxConfig{})

	require.NoError(t, err)
	lima.AssertNotCalled(t, "Create", mock.Anything)
}

func TestService_Create_Stopped(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Stopped", nil).Once()
	lima.On("Start").Return(nil)
	lima.On("Status").Return("Running", nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Create(TemplateParams{Username: "test", UID: 1000, GID: 1000, HomeDir: "/home/test"}, config.SandboxConfig{})

	require.NoError(t, err)
	lima.AssertCalled(t, "Start")
}

// --- Template rendering test ---

func TestService_Template_RendersWithParams(t *testing.T) {
	svc := NewService(nil, logging.NoopLogger{})

	result, err := svc.Template(TemplateParams{
		Username: "myuser",
		UID:      501,
		GID:      20,
		HomeDir:  "/Users/myuser",
		Mounts:   []string{"/Users/myuser/src"},
	})

	require.NoError(t, err)
	assert.Contains(t, result, "myuser")
	assert.Contains(t, result, "/Users/myuser/src")
	assert.True(t, strings.Contains(result, "writable: true"))
}
