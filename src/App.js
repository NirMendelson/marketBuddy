import React, { useState, useEffect } from "react";
import { HashRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import Home from "./Home";
import Header from "./Header";
import Chat from "./Chat";
import Payment from './Payment';

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user is authenticated on component mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/check-auth', {
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          setIsAuthenticated(data.isAuthenticated);
        }
      } catch (error) {
        console.error('Error checking authentication:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    checkAuth();
  }, []);

  // Function to update authentication state after login/signup
  const handleAuthChange = (authStatus) => {
    setIsAuthenticated(authStatus);
  };

  // Protected Route component
  const ProtectedRoute = ({ children }) => {
    if (isLoading) {
      return <div className="loading-container">
        <div className="loading-circle"></div>
        <div className="loading-message">טוען...</div>
      </div>;
    }
    
    if (!isAuthenticated) {
      return <Navigate to="/" />;
    }
    
    return children;
  };

  return (
    <Router>
      <Routes>
        <Route 
          path="/" 
          element={
            isAuthenticated ? 
            <Navigate to="/chat" /> : 
            <Home onAuthChange={handleAuthChange} />
          } 
        />
        <Route 
          path="/chat" 
          element={
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          } 
        />
        <Route
          path="/payment" 
          element={
            <ProtectedRoute>
              <Payment orderTotal={100.00} /> {/* You'll want to pass the actual total */}
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
};

export default App;