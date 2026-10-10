#!/bin/sh
# Backend container start: apply the pending Prisma migrations, then run the
# given command (the API by default, or the seed: node dist/prisma/seed.js).
set -eu

./node_modules/.bin/prisma migrate deploy

exec "$@"
