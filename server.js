// server.js
const express = require("express");
const app = express();

// Built-in middleware to parse JSON bodies (no need for body-parser package)
app.use(express.json());

// POST /signup route
app.post("/signup", (req, res) => {
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

  // Here you could do any server-side validation, DB insertion, etc.

  // For demonstration, we'll just return a success message:
  res.json({ success: "נרשמת בהצלחה! תודה שנרשמת." });
});

// Run server on port 5000 (for example)
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
