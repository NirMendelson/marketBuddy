// src/Payment.js
import React, { useEffect, useState } from 'react';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { useNavigate, useParams } from 'react-router-dom';
import './Payment.css';

const Payment = ({ orderTotal, isParticipant = false }) => {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const [error, setError] = useState(null);
  const [cartItems, setCartItems] = useState([]);
  const [orderDetails, setOrderDetails] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (!isParticipant) {
      // Only get cart items and order details from localStorage for new orders
      const items = JSON.parse(localStorage.getItem("cartItems") || "[]");
      const details = JSON.parse(localStorage.getItem("orderDetails") || "{}");
      
      // Ensure supermarket has a default value
      if (!details.supermarket) {
        details.supermarket = 'רמי לוי'; // Default supermarket
      }
      
      setCartItems(items);
      setOrderDetails(details);
    }
  }, [isParticipant]);

  const handlePaymentSuccess = async (paymentId, payerId) => {
    console.log('Starting handlePaymentSuccess with:', { paymentId, payerId, isParticipant, orderId });
    try {
      if (isParticipant && orderId) {
        console.log('Processing participant payment for order:', orderId);
        // For participant orders, complete the existing order
        const response = await fetch(`/orders/${orderId}/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            paymentId,
            payerId,
            items: cartItems.map(item => ({
              name: item.name,
              quantity: item.quantity,
              price: item.price,
              unit: item.unit
            }))
          })
        });

        console.log('Server response status:', response.status);
        const responseData = await response.json();
        console.log('Server response data:', responseData);

        if (!response.ok) {
          console.error('Server returned error:', responseData);
          throw new Error(responseData.error || 'Failed to complete order');
        }

        console.log('Order completed successfully:', responseData);
        
        // Redirect to success page
        navigate(`/payment-success?orderId=${orderId}`);
      } else {
        console.log('Processing new order payment');
        // For new orders, create the order after payment
        const userResponse = await fetch('/check-auth', {
          credentials: 'include'
        });
        
        if (!userResponse.ok) {
          console.error('Failed to get user data:', await userResponse.json());
          throw new Error('Failed to get user data');
        }
        
        const userData = await userResponse.json();
        console.log('User data:', userData);
        const supermarket = userData.user?.supermarket || 'רמי לוי';
        const orderDetails = JSON.parse(localStorage.getItem("orderDetails") || "{}");
        console.log('Order details from localStorage:', orderDetails);

        if (!orderDetails.deliveryDate || !orderDetails.deliveryTime) {
          console.error('Missing delivery details:', orderDetails);
          throw new Error("Missing delivery date or time information");
        }

        const response = await fetch('/orders/create-after-payment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            supermarket: supermarket,
            maxParticipants: orderDetails.maxParticipants || 1,
            deliveryDate: orderDetails.deliveryDate,
            deliveryTime: orderDetails.deliveryTime,
            items: JSON.parse(localStorage.getItem("cartItems") || "[]")
          })
        });

        console.log('Create order response status:', response.status);
        const orderData = await response.json();
        console.log('Create order response data:', orderData);

        if (!response.ok) {
          console.error('Failed to create order:', orderData);
          throw new Error(orderData.message || 'Failed to create order');
        }

        setOrderDetails(orderData);
        localStorage.removeItem("cartItems");
        localStorage.removeItem("orderDetails");
        setShowSuccess(true);
        
        // Redirect to success page
        navigate(`/payment-success?orderId=${orderData.order.order_id}`);
      }
    } catch (error) {
      console.error('Error handling payment success:', error);
      setError(error.message);
    }
  };

  const onApprove = async (data, actions) => {
    try {
      await handlePaymentSuccess(data.orderID, data.payerID);
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
        <p>סכום לתשלום: {orderTotal.toFixed(2)}₪</p>
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
                    value: orderTotal.toFixed(2),
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
