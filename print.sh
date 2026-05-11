#!/bin/bash

npx playwright-cli open http://localhost:9323 --headed
npx playwright-cli react-devtools-install
npx playwright-cli reload
npx playwright-cli react-tree "$@"
