// db.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');


console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY?.slice(0, 10), '...');

// Create a new Supabase client for database connection
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Simulate the pool interface to maintain backward compatibility
// This helps us migrate smoothly from PostgreSQL to Supabase
const pool = {
  query: async (text, params) => {
    // Parse the query text to determine the operation type
    if (text.toLowerCase().includes('insert into users')) {
      const { data, error } = await supabase
        .from('users')
        .insert([{
          email: params[0],
          password: params[1],
          name: params[2],
          phone: params[3],
          number: params[4],
          street: params[5],
          city: params[6],
          supermarket: params[7]
        }])
        .select('email');
      
      if (error) throw error;
      return { rows: data };
    }
    
    if (text.toLowerCase().includes('select email, name, password from users')) {
      const { data, error } = await supabase
        .from('users')
        .select('email, name, password, supermarket')
        .eq('email', params[0])
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return { rows: data ? [data] : [] };
    }
    
    // Default fallback - this will need to be extended for other queries
    console.warn(`Unhandled query pattern: ${text}`);
    return { rows: [] };
  }
};

// Function to initialize the database (check connection only)
const initializeDatabase = async () => {
  try {
    console.log('Checking Supabase connection and database structure...');

    // Perform a simple query to check connection
    const { count, error } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('Error connecting to Supabase:', error);
      throw error;
    }

    console.log('Supabase connection established successfully!');
    console.log('Database initialization complete');
  } catch (error) {
    console.error('Error initializing database:', error);
    // Instead of throwing, we'll log the error but allow the server to start
    // This makes development easier when the database isn't fully set up
    console.log('Server continuing despite database initialization issue');
  }
};

// Test the database connection
const testConnection = async () => {
  try {
    const { count, error } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.error('Database connection error:', error);
    } else {
      console.log('Database connected successfully');
    }
  } catch (err) {
    console.error('Database connection test failed:', err);
  }
};

// Run connection test
testConnection();

module.exports = { supabase, pool, initializeDatabase };