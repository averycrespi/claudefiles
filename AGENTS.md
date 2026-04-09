# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

## Overview

This repo stores personal AI agent configuration files, managed via GNU Stow for symlinking into the home directory.

## Commands

- `make install` — install Node dependencies
- `make stow` — symlink `pi/agent/` contents into `~/.pi/agent/`
- `make unstow` — remove those symlinks
- `make typecheck` — type-check extension TypeScript files

## Architecture

The repo uses GNU Stow as a dotfile manager. The `pi/agent/` directory mirrors the target structure under `~/.pi/agent/`:

- `pi/agent/settings.json` — agent settings
- `pi/agent/prompts/` — custom prompt templates
- `pi/agent/skills/` — custom skills
- `pi/agent/extensions/` — extensions (TypeScript, type-checked via `tsconfig.json`)
- `pi/agent/AGENTS.md` — agent instructions for the Pi agent

`AGENTS.md` at the repo root is a separate file for agents operating on this repo itself.

All stowed directories are symlinked, so edits to any file under `pi/agent/` take effect immediately — never tell the user to rerun `make stow` after editing files.
