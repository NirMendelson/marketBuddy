// src/Payment.js
import React from 'react';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import './Payment.css';

const Payment = () => {
  const total = parseFloat(localStorage.getItem("orderTotal") || "0");
  const orderId = localStorage.getItem("currentOrderId");

  const notifyNearbyUsers = async () => {
    try {
      const response = await fetch(`/orders/${orderId}/notify-nearby`, {
        method: 'POST',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to notify nearby users');
      }

      console.log('Nearby users notified successfully');
    } catch (error) {
      console.error('Error notifying nearby users:', error);
    }
  };

  return (
    <div className="payment-container">
      <h2 className="payment-title">השלם תשלום עם PayPal</h2>
      <PayPalScriptProvider options={{
        "client-id": process.env.REACT_APP_PAYPAL_CLIENT_ID,
        currency: "ILS"}}>
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
              alert(`תשלום הושלם ע״י ${details.payer.name.given_name}`);
              
              // Notify nearby users after successful payment
              await notifyNearbyUsers();
              
              // Redirect to chat page
              window.location.href = '/chat';
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
