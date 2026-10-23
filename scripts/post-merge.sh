#!/bin/bash
set -e
corepack pnpm install --frozen-lockfile
corepack pnpm --filter db push
