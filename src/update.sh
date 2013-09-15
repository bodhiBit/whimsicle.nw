#!/bin/bash
git stash &&
git pull &&
git submodule update --recursive

git stash pop
echo Press enter; read enter
