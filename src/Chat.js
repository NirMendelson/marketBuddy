import React, { useState, useRef, useEffect } from "react";
import "./Chat.css";
import { FiSend, FiUser, FiPlus, FiInfo, FiCheck, FiShoppingCart, FiAlertTriangle, FiHelpCircle } from "react-icons/fi";

// API client function to call backend
const processGroceryList = async (message) => {
  try {
    // Call the backend API endpoint
    const response = await fetch('/process-grocery-list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
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

const Chat = () => {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [groceryItems, setGroceryItems] = useState([]);
  const [pendingOptions, setPendingOptions] = useState([]);
  const [notFoundItems, setNotFoundItems] = useState([]);
  const [showUserInfo, setShowUserInfo] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasSubmittedOrder, setHasSubmittedOrder] = useState(false);
  const messagesEndRef = useRef(null);
  
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
      
      // Set the flag that user has submitted an order
      setHasSubmittedOrder(true);
      
      setIsProcessing(true);
      
      // Unique ID for the "thinking" message
      const thinkingMsgId = Date.now().toString();
      
      try {
        // Add a "thinking" message
        setMessages(msgs => [...msgs, { 
          id: thinkingMsgId,
          text: "מתחבר ל-Azure OpenAI API... מעבד את הרשימה שלך...", 
          sender: "ai",
          isProcessing: true
        }]);
        
        // Format the message to ensure it's properly processed
        // Replace commas followed by space with newlines to standardize format
        // This helps the API process comma-separated lists properly
        const formattedMessage = userMessage.replace(/,\s+/g, '\n');
        
        // Call AI service to process grocery list
        console.log("Calling Azure OpenAI API with message:", formattedMessage);
        const aiResponse = await processGroceryList(formattedMessage);
        
        // Log the full structured response to console
        console.log("Azure OpenAI API Processing Results:", aiResponse);
        
        // Remove the "thinking" message
        setMessages(msgs => msgs.filter(m => m.id !== thinkingMsgId));
        
        if (aiResponse.items && aiResponse.items.length > 0) {
          // Separate items into categories:
          // 1. Certain matches (directly add to cart)
          const certain = aiResponse.items.filter(item => item.isCertain);
          
          // 2. Items with potential matches but need user selection
          const uncertain = aiResponse.items.filter(item => !item.isCertain && item.matchedProducts && item.matchedProducts.length > 0);
          
          // 3. Items that couldn't be matched at all
          const notFound = aiResponse.items.filter(item => !item.isCertain && (!item.matchedProducts || item.matchedProducts.length === 0));
          
          // Add the certain items to the grocery list
          updateGroceryItems(certain);
          
          // Store not found items
          setNotFoundItems(notFound);
          
          // Set pending options for uncertain items
          const formattedOptions = uncertain.map(item => ({
            id: Date.now() + Math.random(),
            originalItem: item,
            product: item.product,
            quantity: item.quantity,
            unit: item.unit,
            options: item.matchedProducts
          }));
          
          setPendingOptions(formattedOptions);
          
          // Format response messages based on processing results
          let responseText = "";
          
          // First report on successfully added items
          if (certain.length > 0) {
            responseText += `✅ נוספו ${certain.length} פריטים לעגלה בהצלחה:\n`;
            certain.forEach(item => {
              const topMatch = item.matchedProducts[0];
              responseText += `• ${item.quantity} ${topMatch.unit} ${topMatch.name} - ${topMatch.price}₪\n`;
            });
          }
          
          // Report on items that couldn't be matched at all
          if (notFound.length > 0) {
            if (responseText) responseText += "\n";
            responseText += `❌ לא נמצאו ${notFound.length} פריטים:\n`;
            notFound.forEach(item => {
              responseText += `• ${item.product} (${item.quantity} ${item.unit || ''})\n`;
            });
            responseText += "אתה יכול לנסח מחדש פריטים אלה או לבחור מוצרים דומים מהקטלוג.\n";
          }
          
          // Report on items that need user selection
          if (uncertain.length > 0) {
            if (responseText) responseText += "\n";
            responseText += `⚠️ יש ${uncertain.length} פריטים שדורשים בחירה שלך:\n`;
            uncertain.forEach(item => {
              responseText += `• ${item.product} (${item.quantity} ${item.unit || ''})\n`;
            });
          }
          
          // Add the formatted response to chat
          setMessages(msgs => [...msgs, { 
            text: responseText, 
            sender: "ai" 
          }]);
          
          // Show options selection UI if we have uncertain items
          if (uncertain.length > 0) {
            setMessages(msgs => [...msgs, { 
              text: "אנא בחר את האפשרות המתאימה עבור כל פריט:",
              sender: "ai",
              isOptions: true,
              options: formattedOptions
            }]);
          }
        } else {
          // No items found
          setMessages(msgs => [...msgs, { 
            text: "לא הצלחתי לזהות פריטים ברשימה שלך. אנא נסה שוב עם פורמט אחר או הוסף פרטים נוספים.", 
            sender: "ai" 
          }]);
        }
        
      } catch (error) {
        console.error("Error processing grocery list with Azure OpenAI API:", error);
        
        // Remove the "thinking" message
        setMessages(msgs => msgs.filter(m => m.id !== thinkingMsgId));
        
        // Add error message with more specific details
        setMessages(msgs => [...msgs, { 
          text: `שגיאה בחיבור ל-Azure OpenAI API: ${error.message}. אנא בדוק את פרטי ההתחברות ב-.env או פנה למנהל המערכת.`, 
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
      // Create a new item object for our state
      const topMatch = item.matchedProducts.length > 0 ? item.matchedProducts[0] : null;
      
      return {
        id: Date.now() + Math.random(), // Generate a unique ID
        name: topMatch ? topMatch.name : item.product,
        quantity: item.quantity,
        unit: topMatch ? topMatch.unit : item.unit,
        price: topMatch ? topMatch.price : null,
        isCertain: item.isCertain,
        originalItem: item,
        selected: item.isCertain, // Auto-select certain items
        alternativeOptions: item.matchedProducts,
        // Include the reasoning from GPT-4 if available
        reasonForMatch: item.reasonForMatch || null
      };
    });
    
    // Add the new items to our grocery list
    setGroceryItems(prev => [...prev, ...newItems]);
  };

  // Handle option selection for a pending item
  const handleOptionSelect = (itemId, optionIndex) => {
    const pendingItem = pendingOptions.find(item => item.id === itemId);
    if (!pendingItem) return;
    
    const selectedOption = pendingItem.options[optionIndex];
    
    // Add the selected item to the grocery list
    const newItem = {
      id: Date.now() + Math.random(),
      name: selectedOption.name,
      quantity: pendingItem.quantity,
      unit: selectedOption.unit,
      price: selectedOption.price,
      isCertain: true,
      selected: true,
      alternativeOptions: pendingItem.options,
      reasonForMatch: pendingItem.originalItem.reasonForMatch
    };
    
    setGroceryItems(prev => [...prev, newItem]);
    
    // Remove the item from pending options
    setPendingOptions(prev => prev.filter(item => item.id !== itemId));
    
    // Add a confirmation message
    setMessages(msgs => [...msgs, { 
      text: `✅ נוסף לעגלה: ${pendingItem.quantity} ${selectedOption.unit} ${selectedOption.name} - ${selectedOption.price}₪`, 
      sender: "ai",
      isConfirmation: true
    }]);
  };

  // Handle removing an item from the grocery list
  const handleRemoveItem = (itemId) => {
    setGroceryItems(items => items.filter(item => item.id !== itemId));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault(); // Prevents new line in input
      handleSend();
    }
  };

  // Add a new empty message for the user to enter another grocery item
  const handleAddAnotherItem = () => {
    setMessage("");
    // Focus on the input field
    document.querySelector(".chat-input").focus();
  };

  // Try again with not found items
  const handleRetryNotFoundItems = () => {
    if (notFoundItems.length === 0) return;
    
    // Format not found items into a message
    const itemsText = notFoundItems.map(item => 
      `${item.quantity || ""} ${item.product}`
    ).join("\n");
    
    // Set the message and clear not found items
    setMessage(itemsText);
    setNotFoundItems([]);
    
    // Focus on the textarea
    document.querySelector(".chat-input").focus();
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
    
    const total = selectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
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
                <div className="item-name">{item.name}</div>
                <div className="item-details">
                  {item.quantity} {item.unit} • {item.price}₪
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
          <div className="cart-total">סה"כ: {total.toFixed(2)}₪</div>
          <div className="cart-actions">
            <button className="add-item-button" onClick={handleAddAnotherItem}>
              <FiPlus size={16} /> הוסף פריט נוסף
            </button>
            <button className="checkout-button">
              המשך לקופה
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Not Found Items Summary Component
  const NotFoundItemsSummary = () => {
    if (notFoundItems.length === 0) return null;
    
    return (
      <div className="not-found-items">
        <div className="not-found-header">
          <h3><FiAlertTriangle size={18} /> פריטים שלא נמצאו ({notFoundItems.length})</h3>
        </div>
        <div className="not-found-list">
          {notFoundItems.map((item, index) => (
            <div key={index} className="not-found-item">
              {item.product} {item.quantity && `(${item.quantity} ${item.unit || ''})`}
            </div>
          ))}
        </div>
        <button className="retry-button" onClick={handleRetryNotFoundItems}>
          נסה שוב עם פריטים אלה
        </button>
      </div>
    );
  };

  // Pending options summary
  const PendingOptionsSummary = () => {
    if (pendingOptions.length === 0) return null;
    
    return (
      <div className="pending-options-summary">
        <div className="pending-header">
          <h3><FiHelpCircle size={18} /> בחירת אפשרויות ({pendingOptions.length})</h3>
        </div>
        <p>יש פריטים שדורשים את הבחירה שלך בתחתית הצ'אט</p>
      </div>
    );
  };

  // Order Status Summary - shows at the bottom after order is processed
  const OrderStatusSummary = () => {
    // Only show if user has submitted an order and we have results
    if (!hasSubmittedOrder || 
       (groceryItems.length === 0 && pendingOptions.length === 0 && notFoundItems.length === 0)) {
      return null;
    }
    
    const selectedItems = groceryItems.filter(item => item.selected);
    
    return (
      <div className="order-status-summary">
        <div className="status-header">
          <h3>סטטוס ההזמנה שלך</h3>
        </div>
        <div className="status-sections">
          {selectedItems.length > 0 && (
            <div className="status-section">
              <div className="status-label success">
                <FiCheck size={16} /> נוספו לעגלה ({selectedItems.length})
              </div>
            </div>
          )}
          
          {pendingOptions.length > 0 && (
            <div className="status-section">
              <div className="status-label warning">
                <FiHelpCircle size={16} /> ממתינים לבחירה ({pendingOptions.length})
              </div>
            </div>
          )}
          
          {notFoundItems.length > 0 && (
            <div className="status-section">
              <div className="status-label error">
                <FiAlertTriangle size={16} /> לא נמצאו ({notFoundItems.length})
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Example grocery items with each item on a separate line
  const exampleItems = [
    "2 חלב תנובה 3%",
    "1 מקופלת עילית",
    "3 יוגורט תות",
    "1 גבינה לבנה 5% 300 גרם",
    "1 לחם אחיד פרוס"
  ];


  return (
    <div className="app-container">
      <div className="header">
        <div className="app-title">Market Buddy</div>
        <button className="user-button" onClick={() => setShowUserInfo(true)}>
          <FiUser size={20} />
        </button>
      </div>
      
      {hasSubmittedOrder ? (
        // Two-column layout after order submission
        <div className="main-content two-column">
          {/* Left side - Chat interface */}
          <div className="chat-container">
            {/* Chat messages */}
            <div className="chat-messages">
              {messages.map((msg, index) => (
                <div key={msg.id || index} className="message-container">
                  <div className={`message ${msg.sender} ${msg.isProcessing ? 'processing' : ''}`}>
                    {msg.text}
                  </div>
                  
                  {/* Render option buttons if this is an options message */}
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
                rows={3}
              />
              <button 
                className="send-button" 
                onClick={handleSend} 
                disabled={isProcessing}
              >
                <FiSend size={20} />
              </button>
            </div>
            
            <OrderStatusSummary />
          </div>
          
          {/* Right side - Cart and summaries */}
          <div className="sidebar">
            {/* Grocery cart */}
            <GroceryCart />
            
            {/* Not found items summary */}
            <NotFoundItemsSummary />
            
            {/* Pending options reminder */}
            <PendingOptionsSummary />
          </div>
        </div>
      ) : (
        // Centered layout before order submission
        <div className="main-content centered">
          <div className="centered-container">
            <div className="welcome-message">
              <h3>ברוך הבא לעוזר הקניות!</h3>
              <p>הקלד או הדבק את רשימת הקניות שלך באופן הבא:</p>
              <div className="format-instructions">
                <ul className="instruction-list">
                  <li><span className="highlight">כמות מוצר</span> (לדוגמה: "2 חלב", "1 לחם")</li>
                  <li>פריט אחד בכל שורה</li>
                  <li>אפשר להוסיף פרטים כמו: אחוז שומן, יצרן, גודל</li>
                </ul>
              </div>
              <p>לדוגמה:</p>
              <div className="example-list">
                {exampleItems.map((item, index) => (
                  <div key={index} className="example-item">{item}</div>
                ))}
              </div>
            </div>
            
            <div className="chat-input-container">
              <textarea
                className="chat-input"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="הקלד את רשימת הקניות שלך כאן (פריט אחד בכל שורה)..."
                disabled={isProcessing}
                rows={5}
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
        </div>
      )}

      {showUserInfo && (
        <div className="user-info-modal">
          <div className="user-info-content">
            <h3>פרטי משתמש</h3>
            <p>שם: ישראל ישראלי</p>
            <p>דוא"ל: israel@example.com</p>
            <button className="close-button" onClick={() => setShowUserInfo(false)}>סגור</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Chat;