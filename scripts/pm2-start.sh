#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PM2_HOME="${PM2_HOME:-${PROJECT_DIR}/.pm2}"

cd "${PROJECT_DIR}"
pm2 startOrReload ecosystem.config.js
pm2 save
pm2 status
