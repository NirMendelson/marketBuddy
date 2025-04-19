// src/Payment.js
import React, { useEffect, useState } from 'react';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { useNavigate } from 'react-router-dom';
import './Payment.css';

const Payment = () => {
  const navigate = useNavigate();
  const [orderId, setOrderId] = useState(null);
  const total = parseFloat(localStorage.getItem("orderTotal") || "0");

  useEffect(() => {
    // Get order ID from localStorage
    const id = localStorage.getItem("currentOrderId");
    if (!id) {
      console.error('No order ID found');
      navigate('/chat');
      return;
    }
    setOrderId(id);
  }, [navigate]);

  const notifyNearbyUsers = async () => {
    try {
      if (!orderId) {
        throw new Error('Order ID not found');
      }

      const response = await fetch(`/orders/${orderId}/notify-nearby`, {
        method: 'POST',
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to notify nearby users');
      }

      console.log('Nearby users notified successfully');
    } catch (error) {
      console.error('Error notifying nearby users:', error);
      // Don't throw the error to prevent blocking the payment success flow
    }
  };

  // Check if PayPal client ID is configured
  const paypalClientId = process.env.REACT_APP_PAYPAL_CLIENT_ID;
  if (!paypalClientId) {
    return (
      <div className="payment-container">
        <h2 className="payment-title">השלם תשלום עם PayPal</h2>
        <div className="payment-error">
          <p>מצטערים, כרגע לא ניתן לבצע תשלום באמצעות PayPal.</p>
          <p>אנא צור קשר עם התמיכה בכתובת: hello@marketbuddy.dev</p>
        </div>
      </div>
    );
  }

  if (!orderId) {
    return (
      <div className="payment-container">
        <h2 className="payment-title">שגיאה</h2>
        <div className="payment-error">
          <p>לא נמצא מספר הזמנה. אנא נסה שוב.</p>
          <button onClick={() => navigate('/chat')}>חזרה לצ'אט</button>
        </div>
      </div>
    );
  }

  return (
    <div className="payment-container">
      <h2 className="payment-title">השלם תשלום עם PayPal</h2>
      <PayPalScriptProvider options={{
        "client-id": paypalClientId,
        currency: "ILS"
      }}>
        <PayPalButtons
          style={{ layout: 'vertical', color: 'gold', shape: 'pill', label: 'pay' }}
          createOrder={(data, actions) => {
            return actions.order.create({
              purchase_units: [{
                amount: { 
                  value: total.toFixed(2),
                  currency_code: "ILS"
                }    
              }]
            });
          }}
          onApprove={async (data, actions) => {
            try {
              const details = await actions.order.capture();
              
              // Notify nearby users after successful payment
              await notifyNearbyUsers();
              
              // Redirect to success page with order ID using hash router format
              window.location.href = `/#/payment-success?orderId=${orderId}`;
            } catch (error) {
              console.error('Error in payment approval:', error);
              alert('אירעה שגיאה בעיבוד התשלום. אנא נסה שוב.');
            }
          }}
        />
      </PayPalScriptProvider>
    </div>
  );
};

export default Payment;
