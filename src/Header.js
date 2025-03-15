import React from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Header.css";

const Header = ({ isAuthenticated, onAuthChange }) => {
  const navigate = useNavigate();

  // Handle logout
  const handleLogout = async () => {
    try {
      const response = await fetch('/logout', {
        method: 'POST',
        credentials: 'include'
      });
      
      if (response.ok) {
        // Update authentication state
        onAuthChange(false);
        // Redirect to home
        navigate('/');
      }
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  return (
    <header className="main-header">
      <div className="header-item right">
        <Link to="/" className="header-link">
          Market Buddy
        </Link>
      </div>
      
      <div className="header-item center">
        {/* Center content (if needed) */}
      </div>
      
      <div className="header-item left">
        {isAuthenticated ? (
          <>
            <Link to="/chat" className="header-link">
              הזמנות
            </Link>
            <button onClick={handleLogout} className="header-link logout-btn">
              התנתק
            </button>
          </>
        ) : (
          <Link to="/" className="header-link">
            התחבר / הירשם
          </Link>
        )}
      </div>
    </header>
  );
};

export default Header;