// src/Payment.js
import React, { useEffect, useState } from 'react';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import './Payment.css';

const Payment = ({ orderTotal = 0, isParticipant = false }) => {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState(null);
  const [cartItems, setCartItems] = useState([]);
  const [orderDetails, setOrderDetails] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [total, setTotal] = useState(orderTotal);

  useEffect(() => {
    // If total is passed as URL parameter, use that instead of the prop
    const urlTotal = searchParams.get('total');
    if (urlTotal) {
      setTotal(parseFloat(urlTotal));
    } else if (!isParticipant) {
      // For non-participant orders, try to get total from localStorage
      const storedTotal = localStorage.getItem("orderTotal");
      if (storedTotal) {
        setTotal(parseFloat(storedTotal));
      }
    }
  }, [searchParams, isParticipant, orderTotal]);

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
          credentials: 'include', // Important for sessions
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

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to complete order');
        }

        // Redirect to success page
        navigate(`/payment-success?orderId=${orderId}`);
      } else {
        console.log('Processing new order payment');
        // For new orders, create the order after payment
        const userResponse = await fetch('/check-auth', {
          credentials: 'include'
        });
        
        if (!userResponse.ok) {
          throw new Error('Failed to get user data');
        }
        
        const userData = await userResponse.json();
        console.log('User data:', userData);
        
        if (!userData.isAuthenticated) {
          throw new Error('User is not authenticated');
        }

        const supermarket = userData.user?.supermarket || 'רמי לוי';
        const orderDetails = JSON.parse(localStorage.getItem("orderDetails") || "{}");
        console.log('Order details from localStorage:', orderDetails);

        if (!orderDetails.deliveryDate || !orderDetails.deliveryTime) {
          throw new Error("Missing delivery date or time information");
        }

        const response = await fetch('/orders/create-after-payment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include', // Important for sessions
          body: JSON.stringify({
            supermarket: supermarket,
            maxParticipants: orderDetails.maxParticipants || 1,
            deliveryDate: orderDetails.deliveryDate,
            deliveryTime: orderDetails.deliveryTime,
            items: JSON.parse(localStorage.getItem("cartItems") || "[]"),
            paymentId: paymentId,
            payerId: payerId
          })
        });

        console.log('Create order response status:', response.status);
        const orderData = await response.json();
        console.log('Create order response data:', orderData);

        if (!response.ok) {
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
        <p>סכום לתשלום: {total.toFixed(2)}₪</p>
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
                    value: total.toFixed(2),
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
