# E-commerce Database Migrations Guide

## Migration Files Overview

The following migration files create the e-commerce orders and cart system:

1. **2025-01-20-create-cart-items.sql** - Shopping cart
2. **2025-01-20-create-ecommerce-orders.sql** - Main orders table
3. **2025-01-20-create-ecommerce-order-items.sql** - Order items
4. **2025-01-20-create-ecommerce-order-status-history.sql** - Status tracking

## Running Migrations

### ⚡ Quick Start (Recommended)

The project has built-in migration tools. Simply run:

```bash
# Run ALL pending migrations automatically (in correct order)
npm run db:migrate

# Or check migration status first
npm run db:migrate:list
```

### 📋 Available Migration Commands

```bash
# List all migrations and their status
npm run db:migrate:list

# Run all pending migrations
npm run db:migrate

# Run a single specific migration
npm run db:migrate:one

# Rollback the last migration
npm run db:migrate:rollback
```

### 🔍 Step-by-Step Example

```bash
# 1. Check what migrations are pending
npm run db:migrate:list

# Expected output:
# STATUS      | FILENAME
# ⏳ PENDING  | 2025-01-20-create-cart-items.sql
# ⏳ PENDING  | 2025-01-20-create-ecommerce-orders.sql
# ⏳ PENDING  | 2025-01-20-create-ecommerce-order-items.sql
# ⏳ PENDING  | 2025-01-20-create-ecommerce-order-status-history.sql

# 2. Run all pending migrations
npm run db:migrate

# Expected output:
# ✓ Migration completed: 2025-01-20-create-cart-items.sql
# ✓ Migration completed: 2025-01-20-create-ecommerce-orders.sql
# ✓ Migration completed: 2025-01-20-create-ecommerce-order-items.sql
# ✓ Migration completed: 2025-01-20-create-ecommerce-order-status-history.sql
# ✓ Successful: 4

# 3. Verify migrations were applied
npm run db:migrate:list

# Expected output:
# STATUS      | FILENAME
# ✓ EXECUTED  | 2025-01-20-create-cart-items.sql
# ✓ EXECUTED  | 2025-01-20-create-ecommerce-orders.sql
# ✓ EXECUTED  | 2025-01-20-create-ecommerce-order-items.sql
# ✓ EXECUTED  | 2025-01-20-create-ecommerce-order-status-history.sql
```

### 🤝 Team Workflow

When your friend pulls these migration files:

```bash
# 1. Pull latest code
git pull

# 2. Check for new migrations
npm run db:migrate:list

# 3. Run any pending migrations
npm run db:migrate
```

The migration system automatically:
- ✅ Tracks which migrations have been run
- ✅ Runs migrations in chronological order
- ✅ Skips already-executed migrations
- ✅ Stops on errors to prevent data corruption

## Verification

After running migrations, verify tables were created:

```bash
# Using npm script
npm run db:ping

# Or manually check tables in MySQL
mysql -u your_username -p your_database
```

```sql
-- Check all tables exist
SHOW TABLES LIKE '%ecommerce%';
SHOW TABLES LIKE 'cart_items';

-- Check table structures
DESCRIBE cart_items;
DESCRIBE ecommerce_orders;
DESCRIBE ecommerce_order_items;
DESCRIBE ecommerce_order_status_history;
```

## Troubleshooting

### If migration fails:

```bash
# Check what went wrong
npm run db:migrate:list

# Rollback the last migration
npm run db:migrate:rollback

# Try again
npm run db:migrate
```

### Foreign key errors:

The migrations are designed to run in order. If you get foreign key errors, ensure:
1. The `users` table exists (for cart_items and ecommerce_orders)
2. The `products` table exists (for cart_items and order_items)
3. The `product_variants` and `product_units` tables exist

## Important Notes

⚠️ **Order matters!** The migration system runs files in alphabetical order automatically.

⚠️ **Backup first!** Always backup your database before running migrations in production.

✅ Tables use `IF NOT EXISTS` so they're safe to re-run.

✅ Migrations are tracked in `schema_migrations` table to prevent duplicate runs.
