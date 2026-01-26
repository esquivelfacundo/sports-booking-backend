# Database Migrations

## How to run migrations in Railway

### Option 1: Using Railway CLI
```bash
# Connect to the database
railway connect postgres

# Run the migration
\i migrations/create_expenses_table.sql
```

### Option 2: Using Railway Dashboard
1. Go to your Railway project
2. Click on the PostgreSQL service
3. Click on "Data" tab
4. Click on "Query" 
5. Copy and paste the content of `create_expenses_table.sql`
6. Click "Run Query"

### Option 3: Using psql directly
```bash
# Get the DATABASE_URL from Railway
# Then run:
psql $DATABASE_URL -f migrations/create_expenses_table.sql
```

## Migrations List

- `create_expenses_table.sql` - Creates the expenses table for tracking all expenses (2026-01-26)
