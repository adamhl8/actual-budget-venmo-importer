import "node_modules/@adamhl8/configs/dist/configs/justfile.base.just"

auth:
    node src/cli.ts auth

start:
    node src/cli.ts start

sync-once:
    node src/cli.ts sync-once

dry-run:
    node src/cli.ts sync-once --dry-run

list-accounts:
    node src/cli.ts list-accounts
