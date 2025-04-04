require('dotenv').config();
const express = require("express");
const bcrypt = require("bcrypt"); 
const cors = require("cors");
const session = require("express-session");
const app = express();
const { supabase, pool, initializeDatabase } = require('./config/db');
const { processGroceryList } = require('./services/GPT4API');
const { findNearbyUsers } = require('./services/NearbyUsers');
const { sendEmail } = require('./services/email'); 


// Initialize database
initializeDatabase();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
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
    // Insert order into orders table
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert([
        {
          user_email: userEmail,
          supermarket: supermarket,
          max_participants: maxParticipants,
          delivery_fee: deliveryFee,
          delivery_date: deliveryDate,
          status: 'open'
        }
      ])
      .select();

    if (orderError) throw orderError;
    if (!orderData || orderData.length === 0) {
      throw new Error('Failed to create order');
    }

    const order = orderData[0];

    // Add the creator as a participant
    const { error: participantError } = await supabase
      .from('order_participants')
      .insert([
        {
          order_id: order.order_id,
          user_email: userEmail
        }
      ]);

    if (participantError) throw participantError;

    return order;
  } catch (error) {
    console.error('Error creating order:', error);
    throw error;
  }
}


/**
 * Add items to an order
 */
async function addOrderItems(orderId, items, userEmail) {
  try {
    const addedItems = [];
    
    // For each item, insert into order_items
    for (const item of items) {
      const { data, error } = await supabase
        .from('order_items')
        .insert([
          {
            order_id: orderId,
            product_id: item.productId || null,
            user_email: userEmail,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            unit: item.unit || 'יחידה'
          }
        ])
        .select();
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        addedItems.push(data[0]);
      }
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
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .single();
    
    if (orderError) throw orderError;
    if (!order) return null;
    
    // Get order items
    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId);
    
    if (itemsError) throw itemsError;
    
    // Get participants
    const { data: participants, error: participantsError } = await supabase
      .from('order_participants')
      .select('*')
      .eq('order_id', orderId);
    
    if (participantsError) throw participantsError;
    
    // Return order with items and participants
    return {
      ...order,
      items: items || [],
      participants: participants || []
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
    const { data: participations, error: participationError } = await supabase
      .from('order_participants')
      .select('order_id')
      .eq('user_email', userEmail);
    
    if (participationError) throw participationError;
    if (!participations || participations.length === 0) return [];
    
    // Extract order IDs
    const orderIds = participations.map(p => p.order_id);
    
    // Get all orders with these IDs
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .in('order_id', orderIds)
      .order('created_at', { ascending: false });
    
    if (ordersError) throw ordersError;
    return orders || [];
  } catch (error) {
    console.error('Error getting user orders:', error);
    throw error;
  }
}

// Update order status
async function updateOrderStatus(orderId, status) {
  try {
    const { data, error } = await supabase
      .from('orders')
      .update({
        status: status,
        updated_at: new Date().toISOString()
      })
      .eq('order_id', orderId)
      .select();
    
    if (error) throw error;
    return data[0];
  } catch (error) {
    console.error('Error updating order status:', error);
    throw error;
  }
}

// ====== AUTHENTICATION ROUTES ======

// POST /signup route
const axios = require('axios'); // Add this at the top of your server.js if not already

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

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user into users table
    const { data, error } = await supabase
      .from('users')
      .insert([
        {
          email,
          password: hashedPassword,
          name,
          phone,
          number,
          street,
          city,
          supermarket
        }
      ])
      .select('email, name, supermarket');

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: "כתובת האימייל כבר קיימת במערכת" });
      }
      throw error;
    }

    // Construct address string for geocoding
    const address = `${street} ${number}, ${city}, Israel`;

    // Geocode using OpenCage
    const geoRes = await axios.get('https://api.opencagedata.com/geocode/v1/json', {
      params: {
        q: address,
        key: process.env.OPENCAGE
      }
    });

    const geoData = geoRes.data;
    if (
      geoData.results.length === 0 ||
      !geoData.results[0].geometry
    ) {
      throw new Error('לא ניתן לאתר מיקום לפי הכתובת שסופקה');
    }

    const { lat, lng } = geoData.results[0].geometry;

    // Insert coordinates into user_coordinates
    const { error: coordError } = await supabase
      .from('user_coordinates')
      .insert([
        {
          email,
          latitude: lat,
          longitude: lng, // intentional typo if your DB column is named this way
          updated_at: new Date().toISOString()
        }
      ]);

    if (coordError) {
      console.error('Failed to insert user coordinates:', coordError);
      // not throwing here so user still signs up successfully
    }

    // Store user info in session
    req.session.user = {
      email: data[0].email,
      name: data[0].name,
      supermarket: data[0].supermarket
    };

    res.json({
      success: "נרשמת בהצלחה! תודה שנרשמת.",
      user: req.session.user
    });
  } catch (error) {
    console.error('Error during signup:', error.message || error);
    res.status(500).json({ error: "אירעה שגיאה, נא לנסות שוב." });
  }
});


// Login route with secure password check
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Get user with the provided email
    const { data, error } = await supabase
      .from('users')
      .select('email, name, password, supermarket')
      .eq('email', email)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    
    // Check if user exists and password matches
    if (data) {
      const validPassword = await bcrypt.compare(password, data.password);
      
      if (validPassword) {
        // Store user info in session
        req.session.user = {
          email: data.email,
          name: data.name,
          supermarket: data.supermarket
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
    
    // Process the grocery list using GPT4API
    const processedList = await processGroceryList(message);
    
    // Create a new order
    const order = await createOrder(
      userEmail,
      userPreferredSupermarket,
      maxParticipants || 1,
      30.0, // Default delivery fee
      deliveryDate ? new Date(deliveryDate) : null
    );
    
    // Return the processed list and order details
    res.json({
      order: {
        ...order,
        items: [] // Items will be added later when user selects them
      },
      groceryList: {
        items: processedList.items.map(item => ({
          confidence: item.confidence,
          product: item.product,
          quantity: item.quantity,
          unit: item.unit
        }))
      }
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
    const userEmail = req.session.user.email;
    
    // Verify the order exists and belongs to the user or user is a participant
    const order = await getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'ההזמנה לא נמצאה' });
    }
    
    // Check if user is a participant in this order
    const isParticipant = order.participants && 
                          order.participants.some(p => p.user_email === userEmail);
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'אין לך הרשאה לערוך הזמנה זו' });
    }
    
    // Add the items to the order
    const addedItems = await addOrderItems(orderId, items, userEmail);
    
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
    const isParticipant = order.participants &&
                          order.participants.some(p => p.user_email === req.session.user.email);
    
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

// Add new endpoint to notify nearby users after payment
app.post('/orders/:orderId/notify-nearby', isAuthenticated, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userEmail = req.session.user.email;

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (orderError) throw orderError;
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if user is the creator of the order
    if (order.user_email !== userEmail) {
      return res.status(403).json({ error: 'Not authorized to notify for this order' });
    }

    // Find nearby users
    const nearbyUsers = await findNearbyUsers(userEmail);

    if (nearbyUsers.length > 0) {
      console.log(`📍 Found ${nearbyUsers.length} users within 300 meters of ${userEmail}. Sending emails...`);

      for (const user of nearbyUsers) {
        await sendEmail(
          user.email,
          '🚀 הזמנה חדשה קרובה אליך!',
          `שלום,

משתמש באזור שלך יצר הזמנה חדשה ב-${order.supermarket}.  
אם אתה רוצה להצטרף להזמנה ולחסוך בעלויות משלוח, היכנס לאתר עכשיו!

📍 מיקום: ${user.distance} מטר ממך  
🛒 הזמנה מסופרמרקט: ${order.supermarket}  

[📩 הצטרף עכשיו](https://marketbuddy.dev/orders/${order.order_id})

בברכה,  
צוות MarketBuddy`
        );
      }
    } else {
      console.log(`📍 No nearby users found for ${userEmail}`);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error notifying nearby users:', error);
    res.status(500).json({ error: 'Failed to notify nearby users' });
  }
});

// Run server on port 5000 (or from environment variable)
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});