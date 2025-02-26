import React from "react";
import { Link } from "react-router-dom";
import "./Header.css";

const Header = () => {
  return (
    <header className="main-header">
      <div className="header-item right">
        <Link to="/" className="header-link">
          Market Buddy
        </Link>
      </div>
    </header>
  );
};

export default Header;
