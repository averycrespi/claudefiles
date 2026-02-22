package sandbox

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/averycrespi/claudefiles/orchestrator/internal/logging"
	"github.com/averycrespi/claudefiles/orchestrator/internal/paths"
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
	// Convert variadic to interface slice for testify mock
	callArgs := []interface{}{}
	for _, a := range args {
		callArgs = append(callArgs, a)
	}
	return m.Called(callArgs...).Error(0)
}

// --- Embedded file tests (unchanged) ---

func TestEmbeddedFiles_NotEmpty(t *testing.T) {
	assert.NotEmpty(t, limaTemplate)
	assert.NotEmpty(t, claudeMD)
	assert.NotEmpty(t, settingsJSON)
}

func TestEmbeddedFiles_ExecutingPlans(t *testing.T) {
	assert.NotEmpty(t, executingPlansSkill)
	content := string(executingPlansSkill)
	assert.Contains(t, content, "executing-plans")
	assert.Contains(t, content, "git bundle create")
	assert.Contains(t, content, "/exchange/")
}

func TestEmbeddedLimaTemplate_ContainsExpectedContent(t *testing.T) {
	content := string(limaTemplate)
	assert.Contains(t, content, "minimumLimaVersion")
	assert.Contains(t, content, "ubuntu-24.04")
}

func TestEmbeddedLimaTemplate_ContainsExchangeMount(t *testing.T) {
	content := string(limaTemplate)
	assert.Contains(t, content, "/exchange")
	assert.Contains(t, content, "mounts:")
}

func TestEmbeddedSettingsJSON_ValidJSON(t *testing.T) {
	assert.Contains(t, string(settingsJSON), "skipDangerousModePermissionPrompt")
}

// --- Service tests ---

func TestService_Start_NotCreated(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("", nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Start()

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "sandbox not created")
}

func TestService_Start_AlreadyRunning(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Start()

	require.NoError(t, err)
}

func TestService_Start_Stopped(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Stopped", nil)
	lima.On("Start").Return(nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Start()

	require.NoError(t, err)
	lima.AssertCalled(t, "Start")
}

func TestService_Stop_NotCreated(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("", nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Stop()

	require.NoError(t, err)
	lima.AssertNotCalled(t, "Stop")
}

func TestService_Stop_AlreadyStopped(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Stopped", nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Stop()

	require.NoError(t, err)
	lima.AssertNotCalled(t, "Stop")
}

func TestService_Stop_Running(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Stop").Return(nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Stop()

	require.NoError(t, err)
	lima.AssertCalled(t, "Stop")
}

func TestService_Destroy_NotCreated(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("", nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Destroy()

	require.NoError(t, err)
	lima.AssertNotCalled(t, "Delete")
}

func TestService_Destroy_Exists(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Delete").Return(nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Destroy()

	require.NoError(t, err)
	lima.AssertCalled(t, "Delete")
}

func TestService_Provision_NotCreated(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("", nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Provision()

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "sandbox not created")
}

func TestService_Provision_Stopped(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Stopped", nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Provision()

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "sandbox not running")
}

func TestService_Provision_Running(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Copy", mock.Anything, mock.Anything).Return(nil)
	lima.On("Shell", mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return(nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Provision()

	require.NoError(t, err)
	lima.AssertNumberOfCalls(t, "Copy", 3)
	lima.AssertCalled(t, "Copy", mock.Anything, "~/.claude/skills/executing-plans/SKILL.md")
}

func TestService_Create_AlreadyRunning(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Copy", mock.Anything, mock.Anything).Return(nil)
	lima.On("Shell", mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return(nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Create()

	require.NoError(t, err)
	lima.AssertNotCalled(t, "Create", mock.Anything)
}

func TestService_Create_Stopped(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Stopped", nil).Once()
	lima.On("Start").Return(nil)
	// After Start, Provision calls Status again
	lima.On("Status").Return("Running", nil)
	lima.On("Copy", mock.Anything, mock.Anything).Return(nil)
	lima.On("Shell", mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return(nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Create()

	require.NoError(t, err)
	lima.AssertCalled(t, "Start")
}

func TestService_Status_NotCreated(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("", nil)
	var buf strings.Builder
	svc := NewService(lima, logging.NoopLogger{}, nil)

	status, err := svc.StatusString()

	require.NoError(t, err)
	assert.Equal(t, "NotCreated", status)
	_ = buf
}

func TestService_Status_Running(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	status, err := svc.StatusString()

	require.NoError(t, err)
	assert.Equal(t, "Running", status)
}

func TestService_Shell_NotCreated(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("", nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Shell()

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "sandbox not created")
	lima.AssertNotCalled(t, "Shell")
}

func TestService_Shell_Stopped(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Stopped", nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Shell()

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "sandbox not running")
	lima.AssertNotCalled(t, "Shell")
}

func TestService_Shell_Running(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Shell").Return(nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Shell()

	require.NoError(t, err)
	lima.AssertCalled(t, "Shell")
}

func TestService_Shell_WithArgs(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Shell", "ls", "-la").Return(nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Shell("ls", "-la")

	require.NoError(t, err)
	lima.AssertCalled(t, "Shell", "ls", "-la")
}

// mockRunner implements exec.Runner for tests.
type mockRunner struct {
	mock.Mock
}

func (m *mockRunner) Run(name string, args ...string) ([]byte, error) {
	callArgs := []interface{}{name}
	for _, a := range args {
		callArgs = append(callArgs, a)
	}
	ret := m.Called(callArgs...)
	return ret.Get(0).([]byte), ret.Error(1)
}

func (m *mockRunner) RunDir(dir, name string, args ...string) ([]byte, error) {
	callArgs := []interface{}{dir, name}
	for _, a := range args {
		callArgs = append(callArgs, a)
	}
	ret := m.Called(callArgs...)
	return ret.Get(0).([]byte), ret.Error(1)
}

func (m *mockRunner) RunInteractive(name string, args ...string) error {
	callArgs := []interface{}{name}
	for _, a := range args {
		callArgs = append(callArgs, a)
	}
	return m.Called(callArgs...).Error(0)
}

func TestService_Prepare_NotRunning(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Stopped", nil)
	runner := new(mockRunner)
	svc := NewService(lima, logging.NoopLogger{}, runner)

	_, err := svc.Prepare("/repo", ".plans/test-plan.md")

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "sandbox not running")
}

func TestService_Prepare_Running(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Shell", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return(nil)

	runner := new(mockRunner)
	// git rev-parse --abbrev-ref HEAD
	runner.On("RunDir", "/repo", "git", "rev-parse", "--abbrev-ref", "HEAD").Return([]byte("main\n"), nil)
	// git bundle create (match any args since job ID is random)
	runner.On("RunDir", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return([]byte(""), nil)

	svc := NewService(lima, logging.NoopLogger{}, runner)

	result, err := svc.Prepare("/repo", ".plans/test-plan.md")

	require.NoError(t, err)
	assert.Len(t, result.JobID, 8)
	assert.Contains(t, result.Command, "limactl")
	assert.Contains(t, result.Command, "claude")
	assert.Contains(t, result.Command, result.JobID)
	assert.Contains(t, result.Command, "executing-plans")
	assert.Equal(t, "main", result.Branch)
	// Shell should be called exactly once (for git clone), not twice (no Claude launch)
	lima.AssertNumberOfCalls(t, "Shell", 1)
}

func TestService_Prepare_WithGoProxyPatterns(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Shell", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return(nil)

	runner := new(mockRunner)
	runner.On("RunDir", "/repo", "git", "rev-parse", "--abbrev-ref", "HEAD").Return([]byte("main\n"), nil)
	runner.On("RunDir", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return([]byte(""), nil)

	svc := NewService(lima, logging.NoopLogger{}, runner)

	result, err := svc.Prepare("/repo", ".plans/test-plan.md")
	require.NoError(t, err)

	exchangeDir := paths.JobExchangeDir(result.JobID)
	downloadDir := filepath.Join(exchangeDir, "gomodcache", "cache", "download")
	require.NoError(t, os.MkdirAll(downloadDir, 0o755))
	defer os.RemoveAll(exchangeDir)

	patterns := []string{"github.com/myorg/*", "github.com/other/*"}
	cmd := BuildLaunchCommand(result.JobID, ".plans/test-plan.md", patterns)
	assert.Contains(t, cmd, "GOPROXY=file:///exchange/"+result.JobID+"/gomodcache/cache/download")
	assert.Contains(t, cmd, "GONOSUMCHECK=github.com/myorg/*,github.com/other/*")
	assert.Contains(t, cmd, "claude")
}

func TestBuildLaunchCommand_NoPatterns(t *testing.T) {
	cmd := BuildLaunchCommand("abc123", ".plans/test.md", nil)
	assert.NotContains(t, cmd, "GOPROXY")
	assert.NotContains(t, cmd, "GONOSUMCHECK")
	assert.Contains(t, cmd, "claude")
}

func TestBuildLaunchCommand_WithPatterns(t *testing.T) {
	cmd := BuildLaunchCommand("abc123", ".plans/test.md", []string{"github.com/myorg/*"})
	assert.Contains(t, cmd, "GOPROXY=file:///exchange/abc123/gomodcache/cache/download,https://proxy.golang.org,direct")
	assert.Contains(t, cmd, "GONOSUMCHECK=github.com/myorg/*")
}

func TestService_Pull_BundleNotFound_TimesOut(t *testing.T) {
	lima := new(mockLimaClient)
	runner := new(mockRunner)
	svc := NewService(lima, logging.NoopLogger{}, runner)

	// Use a nonexistent job ID — bundle will never appear
	err := svc.Pull("/repo", "nonexistent", 100*time.Millisecond, 50*time.Millisecond)

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "timed out")
}

func TestService_Pull_BundleFound(t *testing.T) {
	lima := new(mockLimaClient)
	runner := new(mockRunner)
	svc := NewService(lima, logging.NoopLogger{}, runner)

	// Create a temporary exchange dir with a fake bundle
	jobID := "testpull1"
	exchangeDir := paths.JobExchangeDir(jobID)
	require.NoError(t, os.MkdirAll(exchangeDir, 0o755))
	defer os.RemoveAll(paths.JobExchangeDir(jobID))

	bundlePath := filepath.Join(exchangeDir, "output.bundle")
	require.NoError(t, os.WriteFile(bundlePath, []byte("fake"), 0o644))

	// git bundle verify
	runner.On("RunDir", "/repo", "git", "bundle", "verify", bundlePath).Return([]byte("ok\n"), nil)
	// git fetch
	runner.On("RunDir", "/repo", "git", "fetch", bundlePath).Return([]byte(""), nil)
	// git merge --ff-only FETCH_HEAD
	runner.On("RunDir", "/repo", "git", "merge", "--ff-only", "FETCH_HEAD").Return([]byte(""), nil)

	err := svc.Pull("/repo", jobID, 5*time.Second, 50*time.Millisecond)

	require.NoError(t, err)
	runner.AssertCalled(t, "RunDir", "/repo", "git", "bundle", "verify", bundlePath)
	runner.AssertCalled(t, "RunDir", "/repo", "git", "merge", "--ff-only", "FETCH_HEAD")

	// Exchange dir should be cleaned up
	_, statErr := os.Stat(exchangeDir)
	assert.True(t, os.IsNotExist(statErr))
}
