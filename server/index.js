import Fastify from 'fastify';
import cors from '@fastify/cors';
import { nanoid } from 'nanoid';
import db from './db.js';

const fastify = Fastify({ logger: true });

// Enable CORS
await fastify.register(cors, {
  origin: true
});

// Initialize database
try {
  await db.initializeDatabase();
  console.log('Database initialized successfully');
} catch (err) {
  console.error('Failed to initialize database:', err);
  process.exit(1);
}

// Menu Items Routes
fastify.get('/api/menu', async () => {
  const { rows } = await db.query('SELECT * FROM menu_items WHERE available = true');
  return rows.map(item => ({
    ...item,
    price: parseFloat(item.price),
    ingredients: item.ingredients || [],
    allergens: item.allergens || [],
    condiments: item.condiments || []
  }));
});

fastify.post('/api/menu', async (request, reply) => {
  const item = request.body;
  const { rows } = await db.query(
    `INSERT INTO menu_items (
      name, description, price, currency, category, meal_type,
      image, ingredients, allergens, condiments, available,
      preparation_time, calories, spicy_level, is_vegetarian,
      is_vegan, is_gluten_free
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING id`,
    [
      item.name,
      item.description,
      item.price,
      item.currency,
      item.category,
      item.mealType,
      item.image,
      JSON.stringify(item.ingredients),
      JSON.stringify(item.allergens),
      JSON.stringify(item.condiments),
      item.available,
      item.preparationTime,
      item.calories,
      item.spicyLevel,
      item.isVegetarian,
      item.isVegan,
      item.isGlutenFree
    ]
  );

  reply.code(201).send({ id: rows[0].id });
});

// Staff Routes
fastify.get('/api/staff', async () => {
  const { rows } = await db.query('SELECT * FROM staff');
  return rows.map(s => ({
    ...s,
    shift: {
      start: s.shift_start,
      end: s.shift_end,
      days: s.shift_days
    }
  }));
});

fastify.post('/api/staff', async (request, reply) => {
  const staff = request.body;
  const id = nanoid();
  await db.query(
    `INSERT INTO staff (
      id, name, email, phone, shift_start, shift_end,
      shift_days, username, password, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      staff.name,
      staff.email,
      staff.phone,
      staff.shift.start,
      staff.shift.end,
      JSON.stringify(staff.shift.days),
      staff.username,
      staff.password,
      staff.status
    ]
  );

  reply.code(201).send({ id });
});

// Tables Routes
fastify.get('/api/tables', async () => {
  const { rows } = await db.query('SELECT * FROM tables ORDER BY number');
  return rows;
});

fastify.post('/api/tables', async (request, reply) => {
  const table = request.body;
  const id = nanoid();
  await db.query(
    `INSERT INTO tables (id, number, seats, location, status)
    VALUES ($1, $2, $3, $4, $5)`,
    [id, table.number, table.seats, table.location, table.status]
  );

  reply.code(201).send({ id });
});

// Orders Routes
fastify.get('/api/orders', async () => {
  const { rows } = await db.query(`
    SELECT o.*, t.number as table_number 
    FROM orders o 
    JOIN tables t ON o.table_id = t.id 
    ORDER BY o.created_at DESC
  `);
  return rows.map(order => ({
    ...order,
    items: order.items,
    total: parseFloat(order.total),
    tax: parseFloat(order.tax),
    subtotal: parseFloat(order.subtotal)
  }));
});

fastify.post('/api/orders', async (request, reply) => {
  const order = request.body;
  const id = nanoid();
  await db.query(
    `INSERT INTO orders (
      id, table_id, items, status, total, tax,
      subtotal, waiter_id, waiter_name, estimated_time
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      order.tableId,
      JSON.stringify(order.items),
      order.status,
      order.total,
      order.tax,
      order.subtotal,
      order.waiterId,
      order.waiterName,
      order.estimatedTime
    ]
  );

  reply.code(201).send({ id });
});

fastify.patch('/api/orders/:id/status', async (request, reply) => {
  const { id } = request.params;
  const { status } = request.body;

  await db.query(
    'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [status, id]
  );

  reply.code(200).send({ success: true });
});

// Authentication Route
fastify.post('/api/auth/login', async (request, reply) => {
  const { username, password } = request.body;
  
  if (username === 'admin' && password === 'admin123') {
    return { id: 'admin', name: 'Admin', role: 'admin' };
  }

  const { rows } = await db.query(
    'SELECT * FROM staff WHERE username = $1 AND password = $2 AND status = $3',
    [username, password, 'active']
  );

  if (rows.length > 0) {
    const staff = rows[0];
    return { id: staff.id, name: staff.name, role: 'waiter' };
  }

  reply.code(401).send({ error: 'Invalid credentials' });
});

// Start server
try {
  await fastify.listen({ port: 3000, host: '0.0.0.0' });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}