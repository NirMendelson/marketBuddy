import React, { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./Chat.css";
import { FiSend, FiUser } from "react-icons/fi";
import Payment from "./Payment";

const OrderParticipant = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderDetails, setOrderDetails] = useState(null);
  const [hasSubmittedOrder, setHasSubmittedOrder] = useState(false);
  const [error, setError] = useState(null);
  const [showPayPal, setShowPayPal] = useState(false);
  const [orderTotal, setOrderTotal] = useState(0);
  const messagesEndRef = useRef(null);

  // Fetch order details when component mounts
  useEffect(() => {
    const fetchOrderDetails = async () => {
      try {
        const response = await fetch(`/orders/${orderId}`);
        
        if (!response.ok) {
          const errorData = await response.json();
          if (response.status === 404) {
            throw new Error('Order not found');
          }
          throw new Error(errorData.error || 'Failed to fetch order details');
        }
        
        const data = await response.json();
        console.log('Order details:', data); // Debug log
        setOrderDetails(data.order);
      } catch (error) {
        console.error('Error fetching order:', error);
        setError(error.message);
      }
    };
    
    fetchOrderDetails();
  }, [orderId]);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const adjustTextareaHeight = (textarea) => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  };

  const handleMessageChange = (e) => {
    setMessage(e.target.value);
    adjustTextareaHeight(e.target);
  };

  const handleSend = async () => {
    if (message.trim() !== "") {
      console.log('Starting handleSend with message:', message);
      
      if (!hasSubmittedOrder) {
        console.log('Setting hasSubmittedOrder to true');
        setHasSubmittedOrder(true);
      }

      const userMessage = message;
      console.log('Adding user message to chat:', userMessage);
      setMessages(msgs => [...msgs, { text: userMessage, sender: "user" }]);
      setMessage("");
      
      setIsProcessing(true);
      
      try {
        // Check if this is the "סיים" command
        if (userMessage.trim() === "סיים") {
          console.log('Processing "סיים" command');
          
          // Calculate the total from the last order summary message
          const lastMessage = messages[messages.length - 1];
          if (lastMessage && lastMessage.text.includes('סה"כ')) {
            const totalMatch = lastMessage.text.match(/סה"כ ([\d.]+)₪/);
            if (totalMatch) {
              const total = parseFloat(totalMatch[1]);
              console.log('Setting order total:', total);
              setOrderTotal(total);
            }
          }
          
          // Show PayPal integration
          setShowPayPal(true);
          setMessages(msgs => [...msgs, { 
            text: "אנא בחר את שיטת התשלום:",
            sender: "ai",
            isPayment: true
          }]);
          
          setIsProcessing(false);
          return;
        }

        console.log('Sending message to server:', userMessage);
        const response = await fetch(`/orders/${orderId}/add-items`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ message: userMessage })
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to add items to order');
        }
        
        const data = await response.json();
        console.log('Server response:', data);
        console.log('Items data:', data.items);
        
        // Check if we need to show options
        if (data.items && data.items.requiresSelection) {
          console.log('Processing requiresSelection branch');
          console.log('Options available:', data.items.options);
          
          const options = data.items.options.map(option => {
            console.log('Processing product option:', option);
            return {
              name: option.name,
              price: option.price,
              unit: option.unit,
              quantity: option.quantity
            };
          });
          
          console.log('Formatted options:', options);
          console.log('Adding options message to chat');
          
          setMessages(msgs => {
            console.log('Current messages before adding options:', msgs);
            const newMessages = [...msgs, { 
              text: "אנא בחר את האפשרות המתאימה:",
              sender: "ai",
              isOptions: true,
              options: options,
              originalItem: data.items  // Store the original item data for selection
            }];
            console.log('Messages after adding options:', newMessages);
            return newMessages;
          });
        } else {
          console.log('Processing non-selection branch');
          // Show order summary and ask if finished
          const items = Array.isArray(data.items) ? data.items : [data.items];
          console.log('Processed items:', items);
          
          const deliveryFee = 10.0;
          const subtotal = items.reduce((sum, item) => {
            console.log('Calculating subtotal for item:', item);
            const itemTotal = (item.price || 0) * (item.quantity || 1);
            console.log('Item total:', itemTotal);
            return sum + itemTotal;
          }, 0);
          console.log('Subtotal:', subtotal);
          
          const total = subtotal + deliveryFee;
          console.log('Total:', total);
          
          let responseText = `סיכום הזמנה:\n`;
          
          // Add items to summary
          items.forEach(item => {
            console.log('Processing item for display:', item);
            const quantity = item.quantity || 1;
            const unit = item.unit || '';
            const name = item.name || item.product || '';
            const price = item.price || 0;
            responseText += `- ${quantity} ${unit} ${name} - ${price}₪\n`;
          });
          
          responseText += `- משלוח - ${deliveryFee}₪\n\n`;
          responseText += `סה"כ ${total.toFixed(1)}₪\n\n`;
          responseText += `לסיום ההזמנה הקלד "סיים"\nלהוספת פריטים נוספים, הקלד אותם כעת`;
          
          console.log('Adding summary message to chat:', responseText);
          setMessages(msgs => [...msgs, { 
            text: responseText,
            sender: "ai"
          }]);
        }
        
      } catch (error) {
        console.error("Error adding items:", error);
        setMessages(msgs => [...msgs, { 
          text: `שגיאה בהוספת הפריטים: ${error.message}`, 
          sender: "ai" 
        }]);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  // Add handleOptionSelect function
  const handleOptionSelect = async (optionIndex, originalItem) => {
    console.log('Option selected:', optionIndex);
    console.log('Original item:', originalItem);
    try {
      // Get the selected option from the original item's options array
      const selectedOption = originalItem.options[optionIndex];
      console.log('Selected option:', selectedOption);

      const response = await fetch(`/orders/${orderId}/select-option`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          name: selectedOption.name,
          price: selectedOption.price,
          unit: selectedOption.unit,
          quantity: selectedOption.quantity
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to select option');
      }
      
      const data = await response.json();
      console.log('Selection response:', data);
      
      // Show order summary after selection
      const deliveryFee = 10.0;
      const subtotal = data.items.reduce((sum, item) => {
        const itemTotal = (item.price || 0) * (item.quantity || 1);
        return sum + itemTotal;
      }, 0);
      const total = subtotal + deliveryFee;
      
      let responseText = `סיכום הזמנה:\n`;
      
      data.items.forEach(item => {
        responseText += `- ${item.quantity} ${item.unit} ${item.name} - ${item.price}₪\n`;
      });
      
      responseText += `- משלוח - ${deliveryFee}₪\n\n`;
      responseText += `סה"כ ${total.toFixed(1)}₪\n\n`;
      responseText += `לסיום ההזמנה הקלד "סיים"\nלהוספת פריטים נוספים, הקלד אותם כעת`;
      
      console.log('Adding summary after selection:', responseText);
      setMessages(msgs => [...msgs, { 
        text: responseText,
        sender: "ai"
      }]);
      
    } catch (error) {
      console.error("Error selecting option:", error);
      setMessages(msgs => [...msgs, { 
        text: `שגיאה בבחירת האפשרות: ${error.message}`, 
        sender: "ai" 
      }]);
    }
  };

  // Handle Enter key press
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaymentSuccess = async (details) => {
    console.log('Payment successful:', details);
    try {
      const response = await fetch(`/orders/${orderId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          paymentId: details.id,
          payerId: details.payer.payer_id
        })
      });

      if (!response.ok) {
        throw new Error('Failed to complete order');
      }

      const data = await response.json();
      console.log('Order completed:', data);

      setMessages(msgs => [...msgs, { 
        text: "התשלום בוצע בהצלחה! ההזמנה שלך הושלמה.",
        sender: "ai"
      }]);

      // Redirect to success page or show success message
      navigate(`/order-success/${orderId}`);
    } catch (error) {
      console.error('Error completing order:', error);
      setMessages(msgs => [...msgs, { 
        text: `שגיאה בהשלמת ההזמנה: ${error.message}`,
        sender: "ai"
      }]);
    }
  };

  if (error) {
    return (
      <div className="app-container">
        <div className="header">
          <div className="app-title">Market Buddy</div>
        </div>
        <div className="main-content centered">
          <div className="error-message">
            <h3>שגיאה</h3>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="header">
        <div className="app-title">Market Buddy</div>
      </div>

      <div className="main-content centered">
        <div className="centered-container">
          {!hasSubmittedOrder ? (
            <div className="welcome-message">
              <h3>הצטרפות להזמנה משותפת</h3>
              {orderDetails && (
                <div className="order-details">
                  <p>סופרמרקט: {orderDetails.supermarket || 'רמי לוי'}</p>
                  <p>תאריך משלוח: {orderDetails.delivery_date ? new Date(orderDetails.delivery_date).toLocaleDateString('he-IL') : 'לא נבחר'}</p>
                  <p>שעת משלוח: {orderDetails.delivery_time || 'לא נבחר'}</p>
                  <p>מספר משתתפים: {orderDetails.participants?.length || 1}/{orderDetails.max_participants || 1}</p>
                </div>
              )}
              <p>אתה יכול להוסיף עד 10 פריטים להזמנה.</p>
              <div className="format-instructions">
                <p>הקלד או הדבק את רשימת הקניות שלך באופן הבא:</p>
                <ul className="instruction-list">
                  <li><span className="highlight">כמות מוצר</span> (לדוגמה: "2 חלב", "1 לחם")</li>
                  <li>פריט אחד בכל שורה</li>
                  <li>אפשר להוסיף פרטים כמו: אחוז שומן, יצרן, גודל</li>
                </ul>
              </div>
              <div className="chat-input-container">
                <textarea
                  className="chat-input"
                  value={message}
                  onChange={handleMessageChange}
                  onKeyDown={handleKeyDown}
                  placeholder="הקלד את רשימת הקניות שלך כאן (פריט אחד בכל שורה)..."
                  disabled={isProcessing}
                  rows={1}
                />
                <button 
                  className="send-button" 
                  onClick={handleSend} 
                  disabled={isProcessing}
                >
                  <FiSend size={20} />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="chat-messages">
                {messages.map((msg, index) => (
                  <div key={index} className={`message ${msg.sender}`}>
                    {msg.text}
                    {msg.isOptions && (
                      <div className="options-container">
                        {msg.options.map((option, idx) => (
                          <button
                            key={idx}
                            className="option-button"
                            onClick={() => handleOptionSelect(idx, msg.originalItem)}
                          >
                            {option.quantity} {option.unit} {option.name} - {option.price}₪
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {showPayPal && (
                <div className="payment-section">
                  <Payment orderTotal={orderTotal} isParticipant={true} />
                </div>
              )}

              <div className="chat-input-container">
                <textarea
                  className="chat-input"
                  value={message}
                  onChange={handleMessageChange}
                  onKeyDown={handleKeyDown}
                  placeholder="הקלד את רשימת הקניות שלך כאן (פריט אחד בכל שורה)..."
                  disabled={isProcessing}
                  rows={1}
                />
                <button 
                  className="send-button" 
                  onClick={handleSend} 
                  disabled={isProcessing}
                >
                  <FiSend size={20} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderParticipant; 