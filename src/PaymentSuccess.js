import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './PaymentSuccess.css';

const PaymentSuccess = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const orderId = new URLSearchParams(location.search).get('orderId');

  useEffect(() => {
    // If no orderId, redirect to chat
    if (!orderId) {
      navigate('/chat');
    }
  }, [orderId, navigate]);

  if (!orderId) {
    return null;
  }

  return (
    <div className="payment-success-container">
      <div className="payment-success-content">
        <h1>✅ התשלום בוצע בהצלחה!</h1>
        <p>מספר ההזמנה שלך: {orderId}</p>
        <p>הזמנתך נשלחה למשתמשים בקרבתך</p>
        <button 
          className="back-to-chat-button"
          onClick={() => navigate('/chat')}
        >
          חזרה לצ'אט
        </button>
      </div>
    </div>
  );
};

export default PaymentSuccess; 