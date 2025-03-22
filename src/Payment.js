// src/Payment.js
import React from 'react';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import './Payment.css';

const Payment = () => {
  const total = parseFloat(localStorage.getItem("orderTotal") || "0");

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
          onApprove={(data, actions) => {
            return actions.order.capture().then(details => {
              alert(`תשלום הושלם ע״י ${details.payer.name.given_name}`);
              // Optionally redirect here
            });
          }}
        />
      </PayPalScriptProvider>
    </div>
  );
  
};

export default Payment;
