import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS menu_items (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        price DECIMAL NOT NULL,
        currency TEXT NOT NULL,
        category TEXT NOT NULL,
        meal_type TEXT NOT NULL,
        image TEXT,
        ingredients JSONB,
        allergens JSONB,
        condiments JSONB,
        available BOOLEAN DEFAULT true,
        preparation_time TEXT,
        calories INTEGER,
        spicy_level INTEGER,
        is_vegetarian BOOLEAN,
        is_vegan BOOLEAN,
        is_gluten_free BOOLEAN
      );

      CREATE TABLE IF NOT EXISTS staff (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        shift_start TEXT,
        shift_end TEXT,
        shift_days JSONB,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tables (
        id TEXT PRIMARY KEY,
        number TEXT NOT NULL UNIQUE,
        seats INTEGER NOT NULL,
        location TEXT,
        status TEXT DEFAULT 'available',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        table_id TEXT NOT NULL REFERENCES tables(id),
        items JSONB NOT NULL,
        status TEXT NOT NULL,
        total DECIMAL NOT NULL,
        tax DECIMAL NOT NULL,
        subtotal DECIMAL NOT NULL,
        waiter_id TEXT NOT NULL REFERENCES staff(id),
        waiter_name TEXT NOT NULL,
        estimated_time TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS reservations (
        id TEXT PRIMARY KEY,
        customer_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        date DATE NOT NULL,
        time TIME NOT NULL,
        guests INTEGER NOT NULL,
        special_requests TEXT,
        status TEXT DEFAULT 'pending',
        pre_order_items JSONB,
        total DECIMAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS waiter_calls (
        id TEXT PRIMARY KEY,
        table_id TEXT NOT NULL REFERENCES tables(id),
        status TEXT DEFAULT 'pending',
        assigned_waiter_id TEXT NOT NULL REFERENCES staff(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log('Executed query', { text, duration, rows: res.rowCount });
  return res;
}

export async function getClient() {
  const client = await pool.connect();
  const query = client.query.bind(client);
  const release = client.release.bind(client);

  // Set a timeout of 5 seconds, after which we will log this client's last query
  const timeout = setTimeout(() => {
    console.error('A client has been checked out for more than 5 seconds!');
    console.error(`The last executed query on this client was: ${client.lastQuery}`);
  }, 5000);

  // Monkey patch the query method to keep track of the last query executed
  client.query = (...args) => {
    client.lastQuery = args;
    return query(...args);
  };

  client.release = () => {
    clearTimeout(timeout);
    client.query = query;
    client.release = release;
    return release();
  };

  return client;
}

export default {
  query,
  getClient,
  initializeDatabase
};