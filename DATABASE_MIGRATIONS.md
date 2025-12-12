# Database Migrations System

## Overview

This project now includes an **automatic database migration system** that runs every time you start the backend server with `npm run dev:full` or `npm run server`.

## How It Works

1. **Automatic Execution**: Migrations run automatically when the backend starts
2. **Tracking**: A `schema_migrations` table tracks which migrations have been executed
3. **Chronological Order**: Migrations are executed in alphabetical/chronological order based on filename
4. **Idempotent**: Each migration runs only once - already executed migrations are skipped
5. **Safe**: Uses database transactions and graceful error handling

## Migration File Naming Convention

Migration files should follow this pattern:
```
YYYY-MM-DD-description-of-change.sql
```

Examples:
- `2025-12-10-create-users-table.sql`
- `2025-12-12-merge-contacts-users-ecommerce.sql`
- `2025-12-15-add-notifications-table.sql`

## Available Commands

### 1. Run Migrations Automatically (Default)
```bash
npm run server         # Migrations run on startup
npm run dev:full       # Migrations run on startup
```

### 2. Run Migrations Manually
```bash
npm run db:migrate
```

### 3. List All Migrations
```bash
npm run db:migrate:list
```

Output example:
```
📋 Database Migrations Status:

================================================================================
STATUS      | FILENAME
================================================================================
✓ EXECUTED | 2025-12-10-create-users-table.sql
⏳ PENDING  | 2025-12-12-merge-contacts-users-ecommerce.sql
⏳ PENDING  | 2025-12-15-add-notifications-table.sql
================================================================================

Total: 3 | Executed: 1 | Pending: 2
```

### 4. Rollback Last Migration (Development Only)
```bash
npm run db:migrate:rollback
```

⚠️ **Warning**: This only removes the migration record from `schema_migrations`. It does NOT undo the SQL changes. You need to manually write and execute rollback SQL if needed.

## Creating a New Migration

1. **Create a new `.sql` file** in `backend/migrations/` with the proper naming convention:
   ```bash
   touch backend/migrations/2025-12-15-add-notifications-table.sql
   ```

2. **Write your SQL**:
   ```sql
   -- Migration: Add notifications table
   -- Date: 2025-12-15
   -- Description: Create table for user notifications
   
   CREATE TABLE IF NOT EXISTS notifications (
       id INT AUTO_INCREMENT PRIMARY KEY,
       user_id INT NOT NULL,
       message TEXT NOT NULL,
       read_at DATETIME NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (user_id) REFERENCES contacts(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
   
   CREATE INDEX idx_user_id ON notifications(user_id);
   CREATE INDEX idx_read_at ON notifications(read_at);
   ```

3. **Restart your server** (or run `npm run db:migrate`):
   ```bash
   npm run dev:full
   ```

4. **Verify it ran**:
   ```bash
   npm run db:migrate:list
   ```

## Migration Best Practices

### ✅ DO:
- Use `CREATE TABLE IF NOT EXISTS` to avoid errors on re-runs
- Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` when possible (MySQL 8.0.22+)
- Add proper indexes for foreign keys and frequently queried columns
- Include comments explaining what the migration does
- Test migrations on a development database first
- Keep migrations small and focused on one change
- Use transactions (the system handles this automatically)

### ❌ DON'T:
- Don't modify existing migration files after they've been executed
- Don't delete migration files that have been executed
- Don't use database-specific features unless necessary
- Don't forget to backup production database before running migrations

## Handling Existing Columns

If a column already exists, the migration might fail. Handle this gracefully:

```sql
-- Option 1: Use IF NOT EXISTS (MySQL 8.0.22+)
ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Option 2: For older MySQL, check first in your migration script
-- The migration runner will skip duplicate field errors automatically
ALTER TABLE contacts ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;
```

## Migration Status Table

The system creates a `schema_migrations` table automatically:

```sql
CREATE TABLE schema_migrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(255) NOT NULL UNIQUE,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_filename (filename)
);
```

You can query it directly:
```sql
SELECT * FROM schema_migrations ORDER BY executed_at DESC;
```

## Troubleshooting

### Problem: Migration Fails on Startup

**Solution**: Check the error message in the terminal. The backend will not start if migrations fail.

```bash
# Run migrations manually to see detailed error
npm run db:migrate
```

### Problem: "Table already exists" error

**Solution**: Use `CREATE TABLE IF NOT EXISTS` or handle the error gracefully.

### Problem: Need to re-run a migration

**Solution**: 
1. Manually remove the record from `schema_migrations`:
   ```sql
   DELETE FROM schema_migrations WHERE filename = '2025-12-12-merge-contacts-users-ecommerce.sql';
   ```
2. Restart the server or run `npm run db:migrate`

### Problem: Migration stuck or server won't start

**Solution**:
1. Check MySQL connection: `npm run db:ping`
2. Check migration file syntax
3. Manually execute the SQL to find the error:
   ```bash
   mysql -u root -p boukir < backend/migrations/your-migration.sql
   ```

## Example Migration Flow

```bash
# 1. Start your development environment
npm run dev:full

# Console output:
# 🚀 Initializing database...
# 
# 🔄 Starting database migrations...
# 
# ✓ Migrations tracking table ready
# ✓ Already executed: 2 migrations
# 
# 📋 Found 1 pending migration(s):
# 
#    1. 2025-12-12-merge-contacts-users-ecommerce.sql
# 
# ▶ Executing migration: 2025-12-12-merge-contacts-users-ecommerce.sql
# ✓ Migration completed: 2025-12-12-merge-contacts-users-ecommerce.sql
# 
# ============================================================
# 📊 Migration Summary:
# ============================================================
# ✓ Successful: 1
# ✗ Failed: 0
# ============================================================
# 
# ✅ API listening on http://localhost:3001
```

## Current Migrations

You can check which migrations are in your project:

```bash
ls -la backend/migrations/
```

Example output:
```
2025-01-18-add-detailed-schedules.sql
2025-01-18-create-access-schedules.sql
2025-12-10-create-users-table.sql
2025-12-12-merge-contacts-users-ecommerce.sql
```

## Production Deployment

For production, you have two options:

### Option 1: Automatic (Recommended for small teams)
Migrations run automatically on server startup. Just deploy and restart.

### Option 2: Manual (Recommended for large teams)
1. Run migrations separately before deployment:
   ```bash
   npm run db:migrate
   ```
2. Deploy your application
3. Restart the server (migrations will skip already executed ones)

## Need Help?

- Check logs in the terminal when starting the server
- Run `npm run db:migrate:list` to see migration status
- Check the `schema_migrations` table in your database
- Review migration file syntax
- Test on development database first

---

**✅ Your migrations will now run automatically every time you start the server!**
