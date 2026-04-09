.PHONY: install-dev install-playwright stow unstow stow-claude unstow-claude stow-pi unstow-pi typecheck

install-dev:
	npm install

install-playwright:
	npm install -g @playwright/cli@latest
	npm install -g playwright@latest
	playwright install

stow: stow-claude stow-pi

unstow: unstow-claude unstow-pi

stow-claude:
	mkdir -p ~/.claude
	stow claude -t ~/.claude

unstow-claude:
	stow -D claude -t ~/.claude

stow-pi:
	mkdir -p ~/.pi/agent
	stow -d pi -t ~/.pi/agent agent

unstow-pi:
	stow -D -d pi -t ~/.pi/agent agent

typecheck:
	npx tsc
