require('dotenv').config();
const express = require("express");
const bcrypt = require("bcrypt"); 
const cors = require("cors");  
const app = express();
const { pool, initializeDatabase } = require('./src/config/db');

// Initialize database
initializeDatabase();

// Middleware
app.use(cors());  // Enable CORS for all routes
app.use(express.json());

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
       RETURNING email`,
      [email, hashedPassword, name, phone, number, street, city, supermarket]
    );

    res.json({ success: "נרשמת בהצלחה! תודה שנרשמת.", userEmail: result.rows[0].email });
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
      'SELECT email, name, password FROM users WHERE email = $1',
      [email]
    );
    
    // Check if user exists and password matches
    if (result.rows.length > 0) {
      const validPassword = await bcrypt.compare(password, result.rows[0].password);
      
      if (validPassword) {
        res.json({ 
          success: "התחברת בהצלחה!", 
          userEmail: result.rows[0].email,
          name: result.rows[0].name 
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

// Run server on port 5000 (or from environment variable)
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});