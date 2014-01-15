#!/usr/bin/env sh
git config user.name || git config --local user.name "$USER"
git config user.email || git config --local user.email "$USER@example.com"

git stash &&
git pull --recurse-submodules

git stash pop
echo Press enter; read enter
