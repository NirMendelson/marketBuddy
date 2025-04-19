import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./Chat.css";
import { FiSend, FiUser, FiPlus, FiCheck, FiShoppingCart, FiAlertTriangle, FiHelpCircle, FiCalendar, FiUsers, FiSettings } from "react-icons/fi";

// API client function to call backend
const processGroceryList = async (message, orderId) => {
  try {
    const response = await fetch(`/orders/${orderId}/process-participant-list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ message })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error in processGroceryList:', error);
    throw error;
  }
};

const Participate = () => {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [groceryItems, setGroceryItems] = useState([]);
  const [pendingOptions, setPendingOptions] = useState([]);
  const [notFoundItems, setNotFoundItems] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasSubmittedOrder, setHasSubmittedOrder] = useState(false);
  const [orderDetails, setOrderDetails] = useState(null);
  const messagesEndRef = useRef(null);
  
  // Check if user is authenticated and get order details
  useEffect(() => {
    const checkAuthAndGetOrder = async () => {
      try {
        // Check authentication
        const authResponse = await fetch('/check-auth', {
          credentials: 'include'
        });
        
        if (!authResponse.ok) {
          navigate('/');
          return;
        }
        
        // Get order details
        const orderResponse = await fetch(`/orders/${orderId}`, {
          credentials: 'include'
        });
        
        if (!orderResponse.ok) {
          throw new Error('Failed to fetch order details');
        }
        
        const orderData = await orderResponse.json();
        setOrderDetails(orderData.order);
        
        // Add welcome message
        setMessages([{
          text: `ברוך הבא להזמנה מספר ${orderId}!\n\nאתה יכול להוסיף עד 10 פריטים להזמנה.\nהמשלוח יעלה 10 ש"ח בלבד.\n\nהקלד או הדבק את רשימת הקניות שלך באופן הבא:\n- כמות מוצר (לדוגמה: "2 חלב", "1 לחם")\n- פריט אחד בכל שורה\n- אפשר להוסיף פרטים כמו: אחוז שומן, יצרן, גודל`,
          sender: "ai"
        }]);
        
      } catch (error) {
        console.error('Error:', error);
        navigate('/');
      }
    };
    
    checkAuthAndGetOrder();
  }, [navigate, orderId]);
  
  // Scroll to bottom whenever messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSend = async () => {
    if (message.trim() !== "") {
      // Add user message to chat
      const userMessage = message;
      setMessages([...messages, { text: userMessage, sender: "user" }]);
      setMessage(""); // Clear input field immediately for better UX
      
      // Check if user wants to finish the order
      if (userMessage.toLowerCase() === 'סיים' || userMessage.toLowerCase() === 'סיום') {
        if (groceryItems.length === 0) {
          setMessages(msgs => [...msgs, { 
            text: "אין פריטים בעגלה. אנא הוסף פריטים לפני סיום ההזמנה.", 
            sender: "ai" 
          }]);
          return;
        }
        
        // Show order summary and ask for approval
        const deliveryFee = 10.0;
        const subtotal = groceryItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const total = subtotal + deliveryFee;
        
        let summaryText = `סיכום הזמנה:\n\n`;
        summaryText += `תאריך משלוח: ${new Date(orderDetails.delivery_date).toLocaleDateString('he-IL')}\n`;
        summaryText += `שעת משלוח: ${new Date(orderDetails.delivery_date).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}\n`;
        summaryText += `כתובת איסוף: ${orderDetails.pickup_address}\n\n`;
        
        groceryItems.forEach(item => {
          summaryText += `- ${item.quantity} ${item.unit} ${item.name} - ${item.price}₪\n`;
        });
        
        summaryText += `- משלוח - ${deliveryFee}₪\n`;
        summaryText += `סה"כ לתשלום: ${total.toFixed(2)}₪\n\n`;
        summaryText += `האם אתה מאשר את ההזמנה?`;
        
        setMessages(msgs => [...msgs, { 
          text: summaryText,
          sender: "ai",
          isApproval: true
        }]);
        return;
      }
      
      // Check if user is approving the order
      if (userMessage.toLowerCase() === 'אישור' && messages[messages.length - 1].isApproval) {
        try {
          // Process payment and complete order
          const response = await fetch(`/orders/${orderId}/complete-participation`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
              items: groceryItems
            })
          });
          
          if (!response.ok) {
            throw new Error('Failed to complete participation');
          }
          
          const data = await response.json();
          
          // Show payment link and confirmation
          setMessages(msgs => [...msgs, { 
            text: `ההזמנה אושרה בהצלחה!\n\nלחץ על הקישור הבא כדי לשלם:\n${data.paymentLink}\n\nתודה שהצטרפת להזמנה!`,
            sender: "ai"
          }]);
          
          return;
        } catch (error) {
          console.error('Error completing participation:', error);
          setMessages(msgs => [...msgs, { 
            text: "אירעה שגיאה באישור ההזמנה. אנא נסה שוב או פנה לתמיכה.",
            sender: "ai"
          }]);
        }
        return;
      }
      
      setIsProcessing(true);
      
      try {
        // Process the grocery list
        const apiResponse = await processGroceryList(userMessage, orderId);
        
        // Get the processed items from the API response
        const aiResponse = apiResponse.groceryList;
        
        if (aiResponse.items && aiResponse.items.length > 0) {
          // Convert the response format to match what the frontend expects
          const processedItems = aiResponse.items.map(item => ({
            isCertain: (item.confidence >= 0.9) || (item.confidence >= 0.8 && item.matchedProducts && item.matchedProducts.length === 1),
            matchedProducts: item.matchedProducts || [{
              name: item.matchedProductName || item.product,
              unit: item.unit,
              price: item.price || 0,
              id: null
            }],
            product: item.product,
            quantity: item.quantity,
            unit: item.unit,
            confidence: item.confidence
          }));
          
          // Separate items into categories
          const certain = processedItems.filter(item => item.isCertain);
          const uncertain = processedItems.filter(item => !item.isCertain && item.matchedProducts && item.matchedProducts.length > 0);
          const notFound = processedItems.filter(item => !item.matchedProducts || item.matchedProducts.length === 0);
          
          // Add the certain items to the grocery list
          updateGroceryItems(certain);
          
          // Store not found items
          setNotFoundItems(notFound);
          
          // Set pending options for uncertain items
          const formattedOptions = uncertain.map(item => ({
            id: Date.now() + Math.random(),
            originalItem: item,
            product: item.matchedProducts[0].name,
            quantity: item.quantity,
            unit: item.matchedProducts[0].unit,
            options: item.matchedProducts
          }));
          
          setPendingOptions(formattedOptions);
          
          // Format response messages based on processing results
          let responseText = "";
          
          if (uncertain.length === 0) {
            const deliveryFee = 10.0;
            const subtotal = groceryItems.reduce((sum, item) => sum + (item.price * item.quantity), 0) + 
                            certain.reduce((sum, item) => sum + (item.matchedProducts[0].price * item.quantity), 0);
            const total = subtotal + deliveryFee;
            
            responseText += `סיכום הזמנה:\n`;
            
            groceryItems.forEach(item => {
              responseText += `- ${item.quantity} ${item.unit} ${item.name} - ${item.price}₪\n`;
            });
            
            certain.forEach(item => {
              const topMatch = item.matchedProducts[0];
              responseText += `- ${item.quantity} ${topMatch.unit} ${topMatch.name} - ${topMatch.price}₪\n`;
            });
            
            responseText += `- משלוח - ${deliveryFee}₪\n\n`;
            responseText += `סה"כ ${total.toFixed(1)}₪\n\n`;
            responseText += `לסיום ההזמנה הקלד "סיים"\nלהוספת פריטים נוספים, הקלד אותם כעת`;
          }
          
          if (responseText) {
            setMessages(msgs => [...msgs, { 
              text: responseText, 
              sender: "ai" 
            }]);
          }
          
          if (uncertain.length > 0) {
            setMessages(msgs => [...msgs, { 
              text: "אנא בחר את האפשרות המתאימה עבור כל פריט:",
              sender: "ai",
              isOptions: true,
              options: formattedOptions
            }]);
          }
        } else {
          setMessages(msgs => [...msgs, { 
            text: "לא הצלחתי לזהות פריטים ברשימה שלך. אנא נסה שוב עם פורמט אחר או הוסף פרטים נוספים.", 
            sender: "ai" 
          }]);
        }
        
      } catch (error) {
        console.error("Error processing grocery list:", error);
        setMessages(msgs => [...msgs, { 
          text: `שגיאה בעיבוד הרשימה: ${error.message}. אנא נסה שוב או פנה לתמיכה.`, 
          sender: "ai" 
        }]);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  // Update the grocery items state with the processed items
  const updateGroceryItems = (items) => {
    const newItems = items.map(item => {
      const topMatch = item.matchedProducts && item.matchedProducts.length > 0 ? item.matchedProducts[0] : null;
      
      return {
        id: Date.now() + Math.random(),
        name: topMatch ? topMatch.name : item.product,
        quantity: item.quantity,
        unit: topMatch ? topMatch.unit : item.unit,
        price: topMatch ? topMatch.price : 0,
        productId: topMatch ? topMatch.id : null,
        isCertain: true,
        selected: true,
        alternativeOptions: item.matchedProducts || [],
        reasonForMatch: item.reasonForMatch || null
      };
    });
    
    setGroceryItems(prev => [...prev, ...newItems]);
  };

  // Handle option selection for a pending item
  const handleOptionSelect = async (itemId, optionIndex) => {
    const pendingItem = pendingOptions.find(item => item.id === itemId);
    if (!pendingItem) return;
    
    const selectedOption = pendingItem.options[optionIndex];
    
    const newItem = {
      id: Date.now() + Math.random(),
      name: selectedOption.name,
      quantity: pendingItem.quantity,
      unit: selectedOption.unit,
      price: selectedOption.price,
      productId: selectedOption.id,
      isCertain: true,
      selected: true,
      alternativeOptions: pendingItem.options,
      reasonForMatch: pendingItem.originalItem.reasonForMatch
    };
    
    setGroceryItems(prev => [...prev, newItem]);
    setPendingOptions(prev => prev.filter(item => item.id !== itemId));
    
    const deliveryFee = 10.0;
    const subtotal = groceryItems.reduce((sum, item) => sum + (item.price * item.quantity), 0) + 
                    (selectedOption.price * pendingItem.quantity);
    const total = subtotal + deliveryFee;
    
    let responseText = `סיכום הזמנה:\n`;
    
    groceryItems.forEach(item => {
      responseText += `- ${item.quantity} ${item.unit} ${item.name} - ${item.price}₪\n`;
    });
    
    responseText += `- ${pendingItem.quantity} ${selectedOption.unit} ${selectedOption.name} - ${selectedOption.price}₪\n`;
    responseText += `- משלוח - ${deliveryFee}₪\n\n`;
    responseText += `סה"כ ${total.toFixed(1)}₪\n\n`;
    responseText += `לסיום ההזמנה הקלד "סיים"\nלהוספת פריטים נוספים, הקלד אותם כעת`;
    
    setMessages(msgs => [...msgs, { 
      text: responseText, 
      sender: "ai" 
    }]);
  };

  // Handle removing an item from the grocery list
  const handleRemoveItem = (itemId) => {
    setGroceryItems(items => items.filter(item => item.id !== itemId));
  };

  // Handle Enter key press
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Render option buttons for pending items
  const OptionButtons = ({ item }) => {
    return (
      <div className="option-buttons">
        <div className="option-product">{item.product} ({item.quantity} {item.unit || ''})</div>
        <div className="option-list">
          {item.options.slice(0, 3).map((option, index) => (
            <button 
              key={index} 
              className={`option-button ${option.isSelectedByGPT ? 'ai-recommended' : ''}`}
              onClick={() => handleOptionSelect(item.id, index)}
            >
              {option.isSelectedByGPT && <FiCheck size={14} className="ai-pick" />} 
              {option.name} ({option.brand || 'ללא מותג'}) - {option.price}₪
            </button>
          ))}
        </div>
      </div>
    );
  };

  // Create a component for displaying the grocery cart
  const GroceryCart = () => {
    const selectedItems = groceryItems.filter(item => item.selected);
    
    if (selectedItems.length === 0) {
      return (
        <div className="grocery-cart empty-cart">
          <div className="cart-header">
            <h3><FiShoppingCart size={18} /> סל הקניות שלך</h3>
          </div>
          <div className="empty-cart-message">
            <p>העגלה שלך ריקה</p>
            <p>הוסף פריטים מהרשימה שלך</p>
          </div>
        </div>
      );
    }
    
    const deliveryFee = 10.0;
    const subtotal = selectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const total = subtotal + deliveryFee;
    
    return (
      <div className="grocery-cart">
        <div className="cart-header">
          <h3><FiShoppingCart size={18} /> סל הקניות שלך</h3>
          <div className="item-count">{selectedItems.length} פריטים</div>
        </div>
        
        <div className="cart-items">
          {selectedItems.map(item => (
            <div key={item.id} className="cart-item">
              <div className="item-info">
                <div className="item-name">
                  {item.quantity} × {item.name}
                </div>
                <div className="item-details">
                  {item.unit} • מחיר ליחידה: {item.price}₪ • סה"כ: {(item.quantity * item.price).toFixed(2)}₪
                </div>
              </div>
            
              <button 
                className="remove-item-button" 
                onClick={() => handleRemoveItem(item.id)}
              >
                הסר
              </button>
            </div>          
          ))}
        </div>
        
        <div className="cart-footer">
          <div className="cart-total">סכום ביניים: {subtotal.toFixed(2)}₪</div>
          <div className="cart-total">דמי משלוח: {deliveryFee.toFixed(2)}₪</div>
          <div className="cart-total">סה"כ לתשלום: {total.toFixed(2)}₪</div>
        </div>
      </div>
    );
  };

  const DeliveryOptions = ({ options, onSelect }) => {
    const [selectedDate, setSelectedDate] = useState(null);
    const [selectedTime, setSelectedTime] = useState(null);
    const [showParticipantOptions, setShowParticipantOptions] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState(false);

    const handleDateSelect = (date) => {
      try {
        setSelectedDate(date);
        setSelectedTime(null);
        setShowConfirmation(false);
      } catch (error) {
        console.error('Error in handleDateSelect:', error);
      }
    };

    const handleTimeSelect = (time) => {
      setSelectedTime(time);
      setShowConfirmation(true);
    };

    const handleConfirmation = () => {
      setShowConfirmation(false);
      setShowParticipantOptions(true);
    };

    const handleParticipantSelect = (maxParticipants) => {
      if (selectedDate && selectedTime) {
        console.log('Selected delivery details:', {
          date: selectedDate,
          time: `${selectedTime.start}-${selectedTime.end}`,
          maxParticipants
        });
        onSelect(selectedDate, `${selectedTime.start}-${selectedTime.end}`, maxParticipants);
      }
    };

    return (
      <div className="delivery-options">
        {!showParticipantOptions ? (
          <>
            <div className="delivery-dates">
              {options.map((option, index) => (
                <button
                  key={index}
                  className={`date-button ${selectedDate === option.date ? 'selected' : ''}`}
                  onClick={() => handleDateSelect(option.date)}
                >
                  {option.dayName}, {option.date}
                </button>
              ))}
            </div>
            
            {selectedDate && (
              <div className="delivery-times">
                {options.find(opt => opt.date === selectedDate).timeSlots.map((time, index) => (
                  <button
                    key={index}
                    className={`time-button ${selectedTime === time ? 'selected' : ''}`}
                    onClick={() => handleTimeSelect(time)}
                  >
                    {time.start}-{time.end}
                  </button>
                ))}
              </div>
            )}

            {showConfirmation && (
              <div className="confirmation-section">
                <p>האם אתה מאשר את זמן המשלוח שנבחר?</p>
                <button 
                  className="confirm-delivery"
                  onClick={handleConfirmation}
                >
                  אישור
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="participant-options">
            <h3>מה המספר המרבי של משתתפים שאת/ה מוכן להוסיף להזמנה?</h3>
            <div className="participant-buttons">
              {[1, 2, 3, 4].map(num => (
                <button
                  key={num}
                  className="participant-button"
                  onClick={() => handleParticipantSelect(num)}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="app-container">
      <div className="header">
        <div className="app-title">Market Buddy</div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button className="action-btn small" onClick={() => navigate('/chat')} title="הזמנות">
            הזמנות
          </button>
        </div>
      </div>

      <div className="main-content centered">
        <div className="centered-container">
          <div className="chat-messages">
            {messages.map((msg, index) => (
              <div key={msg.id || index} className="message-container">
                <div className={`message ${msg.sender} ${msg.isProcessing ? 'processing' : ''}`}>
                  {msg.text}
                </div>
                
                {msg.isOptions && pendingOptions.length > 0 && (
                  <div className="options-container">
                    {pendingOptions.map(item => (
                      <OptionButtons key={item.id} item={item} />
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          
          <div className="chat-input-container">
            <textarea
              className="chat-input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
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
        
        <GroceryCart />
      </div>
    </div>
  );
};

export default Participate; 