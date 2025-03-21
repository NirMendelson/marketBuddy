
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiUser, FiSettings } from "react-icons/fi";
import "./Header.css";

const Header = ({ isAuthenticated, onAuthChange }) => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      const response = await fetch('/logout', {
        method: 'POST',
        credentials: 'include'
      });
      
      if (response.ok) {
        onAuthChange(false);
        navigate('/');
      }
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <header className="main-header">
      <div className="header-item right">
        <Link to="/chat" className="action-btn small">
          הזמנות
        </Link>
        <button onClick={handleLogout} className="action-btn small logout">
          התנתק
        </button>
        <button className="user-button" onClick={() => navigate('/chat')} title="הגדרות">
          <FiSettings size={20} />
        </button>
        <button className="user-button" onClick={() => navigate('/chat')} title="פרופיל">
          <FiUser size={20} />
        </button>
      </div>

      <div className="header-item center">
        <Link to="/chat" className="app-name">Market Buddy</Link>
      </div>

      <div className="header-item left" />
    </header>
  );
};

export default Header;
