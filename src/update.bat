git config user.name || git config --local user.name "%USERNAME%"
git config user.email || git config --local user.email "%USERNAME%@example.com"

git stash && git pull --recurse-submodules
git stash pop

pause
