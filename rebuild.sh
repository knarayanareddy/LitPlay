#!/bin/bash
# Rebuild all shared packages (node_modules and dist/ don't persist across turns)
set -e
cd /home/user/litplay
npm install --silent 2>/dev/null
node_modules/.bin/tsc -p packages/contracts/tsconfig.json
node_modules/.bin/tsc -p packages/server-kit/tsconfig.json
echo "Shared packages built."
