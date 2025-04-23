// src/Payment.js
import React, { useEffect, useState } from 'react';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { useNavigate } from 'react-router-dom';
import './Payment.css';

const Payment = () => {
  const navigate = useNavigate();
  // safeTotal will always be a number
  const [safeTotal, setSafeTotal] = useState(0);
  const [orderId, setOrderId] = useState(null);
  const [error, setError] = useState(null);
  const [cartItems, setCartItems] = useState([]);
  const [orderDetails, setOrderDetails] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    // Get cart items and order details from localStorage
    const items = JSON.parse(localStorage.getItem("cartItems") || "[]");
    const details = JSON.parse(localStorage.getItem("orderDetails") || "{}");
    
    // Ensure supermarket has a default value
    if (!details.supermarket) {
      details.supermarket = 'רמי לוי'; // Default supermarket
    }
    
    setCartItems(items);
    setOrderDetails(details);
  }, []);

  // read the total (as string) and parse it only once
  useEffect(() => {
    const stored = localStorage.getItem("orderTotal");
    const n = parseFloat(stored);
    setSafeTotal(!isNaN(n) ? n : 0);
  }, []);

  const createOrderAfterPayment = async () => {
    try {
      const cartItems = JSON.parse(localStorage.getItem("cartItems") || "[]");
      const orderDetails = JSON.parse(localStorage.getItem("orderDetails") || "{}");
      
      console.log('Cart items from localStorage:', cartItems);
      console.log('Order details from localStorage:', orderDetails);
      
      // Get user data from session
      const userResponse = await fetch('/check-auth', {
        credentials: 'include'
      });
      
      if (!userResponse.ok) {
        throw new Error('Failed to get user data');
      }
      
      const userData = await userResponse.json();
      console.log('User data from check-auth:', userData);
      
      const supermarket = userData.user?.supermarket || 'רמי לוי';

      // Get delivery date and time from orderDetails
      const deliveryDate = orderDetails.deliveryDate;
      const deliveryTime = orderDetails.deliveryTime;

      console.log('Delivery date from orderDetails:', deliveryDate);
      console.log('Delivery time from orderDetails:', deliveryTime);

      if (!deliveryDate || !deliveryTime) {
        throw new Error("Missing delivery date or time information");
      }

      const response = await fetch('/orders/create-after-payment', {
        method: 'POST',
        credentials: 'include',  // Ensure session cookie is sent
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          supermarket: supermarket,
          maxParticipants: orderDetails.maxParticipants || 1,
          deliveryDate: deliveryDate,
          deliveryTime: deliveryTime,
          items: cartItems
        })
      });

      if (!response.ok) {
        const { message } = await response.json().catch(() => ({}));
        throw new Error(message || 'Failed to create order');
      }

      const orderData = await response.json();
      setOrderDetails(orderData);
      localStorage.removeItem("cartItems");
      localStorage.removeItem("orderDetails");
      setShowSuccess(true);
      return orderData;
    } catch (error) {
      console.error('Error creating order:', error);
      setError(error.message);
      return null;
    }
  };

  const onApprove = async (data, actions) => {
    try {
      // Create the order in our database after PayPal payment is successful
      const result = await createOrderAfterPayment();
      
      if (!result || !result.order) {
        // Error already set in state by createOrderAfterPayment
        return;
      }
      
      // Get the order ID from the response
      const orderId = result.order.order_id;
      
      // Clear the cart and order details from localStorage
      localStorage.removeItem("cartItems");
      localStorage.removeItem("orderDetails");
      localStorage.removeItem("orderTotal");
      
      // Redirect to success page with the order ID
      navigate(`/payment-success?orderId=${orderId}`);
    } catch (error) {
      console.error('Error after payment approval:', error);
      setError(error.message || 'An error occurred during payment processing');
    }
  };

  const onError = (err) => {
    console.error('PayPal error:', err);
    setError('An error occurred with PayPal. Please try again or contact support.');
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

  return (
    <div className="payment-container">
      <h2 className="payment-title">השלם תשלום עם PayPal</h2>
      <div className="payment-amount">
        <p>סכום לתשלום: {safeTotal.toFixed(2)}₪</p>
      </div>
      {error && (
        <div className="payment-error">
          <p>{error}</p>
        </div>
      )}
      <PayPalScriptProvider 
        options={{ 
          "client-id": paypalClientId,
          currency: "ILS"
        }}
      >
        <PayPalButtons
          style={{ layout: "vertical" }}
          createOrder={(data, actions) => {
            return actions.order.create({
              purchase_units: [
                {
                  amount: {
                    value: safeTotal.toFixed(2),
                    currency_code: "ILS"
                  }
                }
              ]
            });
          }}
          onApprove={onApprove}
          onError={onError}
        />
      </PayPalScriptProvider>
    </div>
  );
};

export default Payment;
