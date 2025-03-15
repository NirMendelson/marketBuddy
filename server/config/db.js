const { Pool } = require('pg');

// Create a new Pool instance for PostgreSQL connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'myapp',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432,
  options: '-c client_encoding=UTF8'
});

// Function to initialize the database (create tables if they don't exist)
const initializeDatabase = async () => {
  try {
    // Create users table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        email VARCHAR(255) PRIMARY KEY,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        number VARCHAR(50) NOT NULL,
        street VARCHAR(255) NOT NULL,
        city VARCHAR(255) NOT NULL,
        supermarket VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create products table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        product_id INT8 PRIMARY KEY,
        name TEXT NOT NULL,
        brand TEXT,
        supermarket_id INT4,
        unit_measure TEXT,
        size NUMERIC,
        price NUMERIC NOT NULL,
        date_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        category TEXT
      )
    `);
    
    // Create orders table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        order_id SERIAL PRIMARY KEY,
        user_email VARCHAR(255) REFERENCES users(email),
        supermarket VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'open',
        max_participants INTEGER NOT NULL DEFAULT 1,
        delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
        delivery_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create order_items table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        item_id SERIAL,
        order_id INTEGER REFERENCES orders(order_id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(product_id),
        name VARCHAR(255) NOT NULL,
        quantity INTEGER NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        unit VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (order_id, item_id)
      )
    `);
    
    // Create order_participants table (for when other users join an order)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_participants (
        participant_id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(order_id) ON DELETE CASCADE,
        user_email VARCHAR(255) REFERENCES users(email),
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Insert sample products if the products table is empty
    const productCount = await pool.query('SELECT COUNT(*) FROM products');
    
    if (parseInt(productCount.rows[0].count) === 0) {
      // Insert sample products
      await pool.query(`
        INSERT INTO products (product_id, name, brand, supermarket_id, unit_measure, base_size, price_per_base_size, size, price)
        VALUES 
          (1, 'חלב 3%', 'תנובה', 1, 'ליטר', 1, 6.90, 1, 6.90),
          (2, 'חלב 1%', 'תנובה', 1, 'ליטר', 1, 6.50, 1, 6.50),
          (3, 'לחם אחיד פרוס', 'אנגל', 1, 'יחידה', 750, 0.013, 750, 9.90),
          (4, 'ביצים L', 'משק רביבים', 1, 'יחידה', 12, 2.5, 12, 29.90),
          (5, 'קוטג 5%', 'תנובה', 1, 'גרם', 250, 0.04, 250, 9.90),
          (6, 'מלפפון', 'ירקות טריים', 1, 'ק"ג', 1, 7.90, 1, 7.90),
          (7, 'עגבניה', 'ירקות טריים', 1, 'ק"ג', 1, 9.90, 1, 9.90),
          (8, 'תפוח עץ', 'פירות טריים', 1, 'ק"ג', 1, 12.90, 1, 12.90),
          (9, 'בננה', 'פירות טריים', 1, 'ק"ג', 1, 8.90, 1, 8.90),
          (10, 'גבינה צהובה 28%', 'תנובה', 1, 'גרם', 200, 0.08, 200, 15.90),
          (11, 'גבינה לבנה 5%', 'טרה', 1, 'גרם', 250, 0.05, 250, 12.50),
          (12, 'יוגורט טבעי', 'יטבתה', 1, 'גרם', 150, 0.03, 150, 4.50),
          (13, 'קורנפלקס', 'תלמה', 1, 'גרם', 500, 0.04, 500, 19.90),
          (14, 'פסטה', 'אסם', 1, 'גרם', 500, 0.018, 500, 8.90),
          (15, 'אורז', 'סוגת', 1, 'ק"ג', 1, 15.90, 1, 15.90),
          (16, 'סוכר', 'סוגת', 1, 'ק"ג', 1, 6.90, 1, 6.90),
          (17, 'מלח', 'מלח הארץ', 1, 'גרם', 500, 0.004, 500, 2.10),
          (18, 'שמן זית', 'יד מרדכי', 1, 'מ"ל', 750, 0.07, 750, 49.90),
          (19, 'טחינה גולמית', 'אחווה', 1, 'גרם', 500, 0.04, 500, 19.90),
          (20, 'מקופלת', 'עלית', 1, 'גרם', 50, 0.25, 50, 12.50),
          (21, 'במבה', 'אסם', 1, 'גרם', 80, 0.11, 80, 8.90),
          (22, 'ביסלי', 'אסם', 1, 'גרם', 90, 0.10, 90, 8.90),
          (23, 'קפה שחור', 'עלית', 1, 'גרם', 200, 0.12, 200, 24.90),
          (24, 'תה', 'ויסוצקי', 1, 'יחידה', 25, 0.20, 25, 4.90),
          (25, 'גבינת שמנת', 'פיראוס', 1, 'גרם', 200, 0.06, 200, 11.90)
        ON CONFLICT (product_id) DO NOTHING
      `);
      
      console.log('Sample products inserted successfully');
    }
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

// Test the database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Database connected successfully');
  }
});

module.exports = { pool, initializeDatabase };