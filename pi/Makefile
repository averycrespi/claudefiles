.PHONY: stow unstow install typecheck

stow:
	mkdir -p ~/.pi/agent
	stow -v -d pi -t ~/.pi/agent agent

unstow:
	stow -v -D -d pi -t ~/.pi/agent agent

install:
	npm install

typecheck:
	npx tsc
