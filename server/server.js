require('dotenv').config();
const express = require("express");
const bcrypt = require("bcrypt"); 
const cors = require("cors");
const session = require("express-session");
const app = express();
const { pool, initializeDatabase } = require('./config/db');
const { processGroceryList } = require('./services/GPT4API');

// Initialize database
initializeDatabase();

// Middleware
app.use(cors({
  origin: 'http://localhost:3000', // Frontend URL
  credentials: true // Allow cookies
}));

app.use(express.json());

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'market-buddy-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Only use secure cookies in production
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Middleware to verify user is authenticated
const isAuthenticated = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'אנא התחבר למערכת כדי לבצע פעולה זו' });
  }
  next();
};

// ====== ORDER FUNCTIONS ======

/**
 * Create a new order for a user
 */
async function createOrder(userEmail, supermarket, maxParticipants = 1, deliveryFee = 0, deliveryDate = null) {
  try {
    const result = await pool.query(
      `INSERT INTO orders (user_email, supermarket, max_participants, delivery_fee, delivery_date) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [userEmail, supermarket, maxParticipants, deliveryFee, deliveryDate]
    );
    
    // Also add the creator as a participant
    await pool.query(
      `INSERT INTO order_participants (order_id, user_email) 
       VALUES ($1, $2)`,
      [result.rows[0].order_id, userEmail]
    );
    
    return result.rows[0];
  } catch (error) {
    console.error('Error creating order:', error);
    throw error;
  }
}

/**
 * Add items to an order
 */
async function addOrderItems(orderId, items) {
  try {
    const addedItems = [];
    
    // For each item, insert into order_items
    for (const item of items) {
      const result = await pool.query(
        `INSERT INTO order_items (order_id, product_id, name, quantity, price, unit) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING *`,
        [
          orderId,
          item.productId || null,
          item.name,
          item.quantity,
          item.price,
          item.unit || 'יחידה'
        ]
      );
      
      addedItems.push(result.rows[0]);
    }
    
    return addedItems;
  } catch (error) {
    console.error('Error adding order items:', error);
    throw error;
  }
}

/**
 * Get an order by ID
 */
async function getOrderById(orderId) {
  try {
    // Get the order
    const orderResult = await pool.query(
      'SELECT * FROM orders WHERE order_id = $1',
      [orderId]
    );
    
    if (orderResult.rows.length === 0) {
      return null;
    }
    
    const order = orderResult.rows[0];
    
    // Get order items
    const itemsResult = await pool.query(
      'SELECT * FROM order_items WHERE order_id = $1',
      [orderId]
    );
    
    // Get participants
    const participantsResult = await pool.query(
      'SELECT * FROM order_participants WHERE order_id = $1',
      [orderId]
    );
    
    // Return order with items and participants
    return {
      ...order,
      items: itemsResult.rows,
      participants: participantsResult.rows
    };
  } catch (error) {
    console.error('Error getting order:', error);
    throw error;
  }
}

/**
 * Get all orders for a user
 */
async function getUserOrders(userEmail) {
  try {
    // Get all orders where the user is a participant
    const result = await pool.query(
      `SELECT o.* FROM orders o
       JOIN order_participants p ON o.order_id = p.order_id
       WHERE p.user_email = $1
       ORDER BY o.created_at DESC`,
      [userEmail]
    );
    
    return result.rows;
  } catch (error) {
    console.error('Error getting user orders:', error);
    throw error;
  }
}


// Update order status
async function updateOrderStatus(orderId, status) {
  try {
    const result = await pool.query(
      `UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE order_id = $2
       RETURNING *`,
      [status, orderId]
    );
    
    return result.rows[0];
  } catch (error) {
    console.error('Error updating order status:', error);
    throw error;
  }
}

// ====== AUTHENTICATION ROUTES ======

// POST /signup route
app.post("/signup", async (req, res) => {
  try {
    // Extract form data from req.body
    const {
      phone,
      email,
      name,
      password,
      number,
      street,
      city,
      supermarket,
    } = req.body;

    // Hash the password (10 is the salt rounds)
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user into database with hashed password
    const result = await pool.query(
      `INSERT INTO users (email, password, name, phone, number, street, city, supermarket) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING email, name, supermarket`,
      [email, hashedPassword, name, phone, number, street, city, supermarket]
    );

    // Store user info in session
    req.session.user = {
      email: result.rows[0].email,
      name: result.rows[0].name,
      supermarket: result.rows[0].supermarket
    };

    res.json({ 
      success: "נרשמת בהצלחה! תודה שנרשמת.", 
      user: req.session.user 
    });
  } catch (error) {
    console.error('Error during signup:', error);
    
    // Check for duplicate email error
    if (error.code === '23505') {
      return res.status(400).json({ error: "כתובת האימייל כבר קיימת במערכת" });
    }
    
    res.status(500).json({ error: "אירעה שגיאה, נא לנסות שוב." });
  }
});

// Login route with secure password check
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Get user with the provided email
    const result = await pool.query(
      'SELECT email, name, password, supermarket FROM users WHERE email = $1',
      [email]
    );
    
    // Check if user exists and password matches
    if (result.rows.length > 0) {
      const validPassword = await bcrypt.compare(password, result.rows[0].password);
      
      if (validPassword) {
        // Store user info in session
        req.session.user = {
          email: result.rows[0].email,
          name: result.rows[0].name,
          supermarket: result.rows[0].supermarket
        };

        res.json({ 
          success: "התחברת בהצלחה!", 
          user: req.session.user
        });
      } else {
        res.status(401).json({ error: "שם משתמש או סיסמה שגויים." });
      }
    } else {
      res.status(401).json({ error: "שם משתמש או סיסמה שגויים." });
    }
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ error: "אירעה שגיאה, נא לנסות שוב." });
  }
});

// Logout route
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.json({ success: 'Logged out successfully' });
  });
});

// Check if user is authenticated
app.get('/check-auth', (req, res) => {
  if (req.session && req.session.user) {
    res.json({ isAuthenticated: true, user: req.session.user });
  } else {
    res.json({ isAuthenticated: false });
  }
});

// ====== ORDER ROUTES ======

// Process grocery list and create a new order
app.post('/orders/process-list', isAuthenticated, async (req, res) => {
  try {
    const { message, maxParticipants, deliveryDate } = req.body;
    const userEmail = req.session.user.email;
    const userPreferredSupermarket = req.session.user.supermarket || 'רמי לוי'; // Default if not set
    
    console.log("Processing grocery list:", message);
    
    // Process the grocery list using AI
    const processedList = await processGroceryList(message);
    
    console.log("Processed list:", processedList);
    
    // Create a new order
    const order = await createOrder(
      userEmail,
      userPreferredSupermarket,
      maxParticipants || 1,
      30.0, // Default delivery fee
      deliveryDate ? new Date(deliveryDate) : null
    );
    
    // Add certain items to the order
    const certainItems = processedList.items
      .filter(item => item.isCertain && item.matchedProducts && item.matchedProducts.length > 0)
      .map(item => {
        const matchedProduct = item.matchedProducts[0];
        return {
          productId: matchedProduct.id,
          name: matchedProduct.name,
          quantity: item.quantity,
          price: matchedProduct.price,
          unit: matchedProduct.unit
        };
      });
    
    // Add items to the order if there are any certain items
    let orderItems = [];
    if (certainItems.length > 0) {
      orderItems = await addOrderItems(order.order_id, certainItems);
    }
    
    // Return the order data along with processed items (both certain and uncertain)
    res.json({
      order: {
        ...order,
        items: orderItems
      },
      groceryList: processedList
    });
  } catch (error) {
    console.error('Error processing grocery list:', error);
    res.status(500).json({ error: 'אירעה שגיאה בעיבוד רשימת הקניות' });
  }
});

// Add selected items to an existing order
app.post('/orders/:orderId/add-items', isAuthenticated, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { items } = req.body;
    
    // Verify the order exists and belongs to the user
    const order = await getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'ההזמנה לא נמצאה' });
    }
    
    if (order.user_email !== req.session.user.email) {
      return res.status(403).json({ error: 'אין לך הרשאה לערוך הזמנה זו' });
    }
    
    // Add the items to the order
    const addedItems = await addOrderItems(orderId, items);
    
    res.json({
      success: true,
      items: addedItems
    });
  } catch (error) {
    console.error('Error adding items to order:', error);
    res.status(500).json({ error: 'אירעה שגיאה בהוספת פריטים להזמנה' });
  }
});

// Get all orders for the current user
app.get('/orders', isAuthenticated, async (req, res) => {
  try {
    const userEmail = req.session.user.email;
    const orders = await getUserOrders(userEmail);
    
    res.json({ orders });
  } catch (error) {
    console.error('Error getting user orders:', error);
    res.status(500).json({ error: 'אירעה שגיאה בטעינת ההזמנות' });
  }
});

// Get a specific order by ID
app.get('/orders/:orderId', isAuthenticated, async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await getOrderById(orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'ההזמנה לא נמצאה' });
    }
    
    // Check if user is a participant in this order
    const isParticipant = order.participants.some(p => p.user_email === req.session.user.email);
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'אין לך הרשאה לצפות בהזמנה זו' });
    }
    
    res.json({ order });
  } catch (error) {
    console.error('Error getting order:', error);
    res.status(500).json({ error: 'אירעה שגיאה בטעינת ההזמנה' });
  }
});

// Process grocery list API (for testing and debugging)
app.post('/api/process-grocery-list', async (req, res) => {
  try {
    const { message } = req.body;
    console.log("Received grocery list to process:", message);
    
    // Use the GPT4API service 
    const result = await processGroceryList(message);
    console.log("Processed result:", result);
    res.json(result);
  } catch (error) {
    console.error('Error processing grocery list:', error);
    res.status(500).json({ error: error.message });
  }
});

// Run server on port 5000 (or from environment variable)
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});