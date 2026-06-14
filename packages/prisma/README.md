# Prisma Schemas (§14)

Each Node.js service has its own Prisma schema matching its database. These
schemas are the source of truth for the ORM models. The raw SQL migrations in
`packages/db/*/` are the Flyway migrations used to initialize the databases.

## Usage

```bash
# Generate Prisma client for a service
cd packages/prisma/auth
npx prisma generate

# Run migrations
npx prisma db push

# The generated client is used by the Prisma*Repository implementations
# in each service's src/repo/ directory.
```

## Mapping to services

| Schema | Service | Database |
|--------|---------|----------|
| `auth/schema.prisma` | auth-service | auth_db |
| `progress/schema.prisma` | progress-service | progress_db |
| `content/schema.prisma` | content-service | content_db |

classroom-service and notification-service use raw SQL migrations directly
(see `packages/db/classroom/` and `packages/db/notification/`).
