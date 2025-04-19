import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./Chat.css";
import { FiUser, FiShoppingCart } from "react-icons/fi";

const Participate = () => {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const [user, setUser] = useState(null);
  const [showUserInfo, setShowUserInfo] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState(null);

  // Check if user is authenticated
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/check-auth', {
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.isAuthenticated) {
            setUser(data.user);
          } else {
            navigate('/');
          }
        }
      } catch (error) {
        console.error('Error checking authentication:', error);
        navigate('/');
      }
    };
    
    checkAuth();
  }, [navigate]);

  // Fetch order details
  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const response = await fetch(`/orders/${orderId}`, {
          credentials: 'include'
        });

        if (!response.ok) {
          throw new Error('Failed to fetch order details');
        }

        const data = await response.json();
        setOrder(data.order);
      } catch (error) {
        console.error('Error fetching order:', error);
        setError('לא ניתן לטעון את פרטי ההזמנה');
      } finally {
        setLoading(false);
      }
    };

    if (orderId) {
      fetchOrder();
    }
  }, [orderId]);

  const handleLogout = async () => {
    try {
      const response = await fetch('/logout', {
        method: 'POST',
        credentials: 'include'
      });
      
      if (response.ok) {
        navigate('/');
      }
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const handleJoinOrder = async () => {
    try {
      const response = await fetch(`/orders/${orderId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to join order');
      }

      // Redirect to chat page after successfully joining
      navigate(`/chat/${orderId}`);
    } catch (err) {
      setError('Failed to join order. Please try again later.');
      console.error('Error joining order:', err);
    }
  };

  if (loading) {
    return <div className="loading">טוען...</div>;
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  if (!order) {
    return <div className="error-message">ההזמנה לא נמצאה</div>;
  }

  return (
    <div className="app-container">
      <div className="header">
        <div className="app-title">Market Buddy</div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button className="action-btn small" onClick={() => navigate('/chat')} title="הזמנות">
            הזמנות
          </button>
          <button 
            className="action-btn small logout" 
            onClick={handleLogout} 
            title="התנתק"
            style={{ backgroundColor: '#dc3545' }}
          >
            התנתק
          </button>
          <button className="user-button" onClick={() => setShowUserInfo(true)} title="פרטי משתמש">
            <FiUser size={20} />
          </button>
        </div>
      </div>

      <div className="main-content centered">
        <div className="centered-container">
          <div className="order-details">
            <h2>הצטרפות להזמנה</h2>
            <div className="order-info">
              <p><strong>סופרמרקט:</strong> {order.supermarket}</p>
              <p><strong>תאריך משלוח:</strong> {new Date(order.delivery_date).toLocaleDateString('he-IL')}</p>
              <p><strong>שעת משלוח:</strong> {new Date(order.delivery_date).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</p>
              <p><strong>מספר משתתפים:</strong> {order.participants?.length || 1}/{order.max_participants}</p>
            </div>

            <div className="order-items">
              <h3>פריטים בהזמנה</h3>
              {order.items?.map((item, index) => (
                <div key={index} className="order-item">
                  <span>{item.quantity} × {item.name}</span>
                  <span>{item.price}₪</span>
                </div>
              ))}
            </div>

            <button 
              className="join-button"
              onClick={handleJoinOrder}
              disabled={order.participants?.length >= order.max_participants}
            >
              {order.participants && order.participants.length >= order.max_participants
                ? 'ההזמנה מלאה'
                : 'הצטרף להזמנה'}
            </button>
          </div>
        </div>
      </div>

      {/* User Info Modal */}
      {showUserInfo && (
        <div className="user-info-modal">
          <div className="user-info-content">
            <h3>פרטי משתמש</h3>
            {user ? (
              <>
                <p>שם: {user.name}</p>
                <p>דוא"ל: {user.email}</p>
                <p>סופרמרקט מועדף: {user.supermarket}</p>
                <button className="close-button" onClick={() => setShowUserInfo(false)}>סגור</button>
                <button 
                  className="close-button" 
                  onClick={handleLogout} 
                  style={{ marginTop: '10px', backgroundColor: '#dc3545' }}
                >
                  התנתק
                </button>
              </>
            ) : (
              <>
                <p>אינך מחובר למערכת</p>
                <button 
                  className="close-button" 
                  onClick={() => { 
                    setShowUserInfo(false);
                    navigate('/');
                  }}
                >
                  התחבר
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Participate; 