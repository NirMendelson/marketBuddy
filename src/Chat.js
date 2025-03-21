import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./Chat.css";
import { FiSend, FiUser, FiPlus, FiCheck, FiShoppingCart, FiAlertTriangle, FiHelpCircle, FiCalendar, FiUsers, FiSettings } from "react-icons/fi";

// API client function to call backend
const processGroceryList = async (message, maxParticipants = 1, deliveryDate = null) => {
  try {
    // Call the backend API endpoint to create an order
    const response = await fetch('/orders/process-list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include', // Important for sessions
      body: JSON.stringify({ 
        message,
        maxParticipants,
        deliveryDate
      })
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

// API function to add items to an existing order
const addItemsToOrder = async (orderId, items) => {
  try {
    const response = await fetch(`/orders/${orderId}/add-items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ items })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error adding items to order:', error);
    throw error;
  }
};

const Chat = () => {
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [groceryItems, setGroceryItems] = useState([]);
  const [pendingOptions, setPendingOptions] = useState([]);
  const [notFoundItems, setNotFoundItems] = useState([]);
  const [showUserInfo, setShowUserInfo] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasSubmittedOrder, setHasSubmittedOrder] = useState(false);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [user, setUser] = useState(null);
  const [maxParticipants, setMaxParticipants] = useState(1);
  const [deliveryDate, setDeliveryDate] = useState(null);
  const [showOrderSettings, setShowOrderSettings] = useState(false);
  const [isAuthChecked, setIsAuthChecked] = useState(false); // Add this state to track auth check
  const messagesEndRef = useRef(null);
  
  // Creates a new order with all the items currently in the shopping cart
  const createOrderFromCart = async () => {
    try {
      // Only proceed if there are items in the cart
      const selectedItems = groceryItems.filter(item => item.selected);
      if (selectedItems.length === 0) {
        setMessages(msgs => [...msgs, { 
          text: "העגלה ריקה. אנא הוסף פריטים לפני יצירת הזמנה.", 
          sender: "ai" 
        }]);
        return;
      }
  
      setIsProcessing(true);
      
      let orderToUse = currentOrder;
      
      // If no order exists yet, create one
      if (!orderToUse) {
        const orderResponse = await fetch('/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({
            supermarket: user?.supermarket || 'רמי לוי',
            maxParticipants: maxParticipants || 1,
            deliveryDate: deliveryDate || null
          })
        });
  
        if (!orderResponse.ok) {
          const errorData = await orderResponse.json();
          throw new Error(errorData.error || 'שגיאה ביצירת ההזמנה');
        }
  
        const orderResult = await orderResponse.json();
        orderToUse = orderResult.order;
        setCurrentOrder(orderToUse);
      }
      
      // Format the cart items for the API
      const itemsToAdd = selectedItems.map(item => ({
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        unit: item.unit
      }));
      
      // Only add items that aren't already in the order
      const itemsResponse = await fetch(`/orders/${orderToUse.order_id}/add-items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ items: itemsToAdd })
      });
      
      if (!itemsResponse.ok) {
        const errorData = await itemsResponse.json();
        throw new Error(errorData.error || 'שגיאה בהוספת פריטים להזמנה');
      }
      
      const itemsResult = await itemsResponse.json();
      
      // Add success message
      setMessages(msgs => [...msgs, { 
        text: `✅ הזמנה מספר ${orderToUse.order_id} עודכנה בהצלחה!
  מספר פריטים: ${itemsToAdd.length}
  סופרמרקט: ${orderToUse.supermarket}`, 
        sender: "ai" 
      }]);
      
    } catch (error) {
      console.error('Error creating order from cart:', error);
      setMessages(msgs => [...msgs, { 
        text: `שגיאה בעדכון הזמנה: ${error.message}`, 
        sender: "ai" 
      }]);
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Check if user is authenticated
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/check-auth', {
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.isAuthenticated) {
            setUser(data.user);
          } else {
            // Redirect to login if not authenticated
            navigate('/', { replace: true }); // Use replace to prevent history stacking
          }
        }
      } catch (error) {
        console.error('Error checking authentication:', error);
        navigate('/', { replace: true }); // Use replace to prevent history stacking
      } finally {
        setIsAuthChecked(true); // Mark auth check as complete
      }
    };
    
    checkAuth();
  }, [navigate]);
  
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
        
        // Call API to process grocery list and create an order
        console.log("Creating order with grocery list:", formattedMessage);
        const apiResponse = await processGroceryList(
          formattedMessage,
          maxParticipants,
          deliveryDate
        );
        
        // Set the current order
        setCurrentOrder(apiResponse.order);
        
        // Log the full structured response to console
        console.log("API Processing Results:", apiResponse);
        
        // Get the processed items from the API response
        const aiResponse = apiResponse.groceryList;
        
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
            responseText += `✅ נוספו ${certain.length} פריטים להזמנה בהצלחה:\n`;
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
          
          // Add order creation confirmation
          responseText += `\nהזמנה חדשה נוצרה בהצלחה!
מספר הזמנה: ${apiResponse.order.order_id}
סופרמרקט: ${apiResponse.order.supermarket}
מספר משתתפים מקסימלי: ${apiResponse.order.max_participants}`;
          
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
        console.error("Error processing grocery list:", error);
        
        // Remove the "thinking" message
        setMessages(msgs => msgs.filter(m => m.id !== thinkingMsgId));
        
        // Add error message with more specific details
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
      // Create a new item object for our state
      const topMatch = item.matchedProducts.length > 0 ? item.matchedProducts[0] : null;
      
      return {
        id: Date.now() + Math.random(), // Generate a unique ID
        name: topMatch ? topMatch.name : item.product,
        quantity: item.quantity,
        unit: topMatch ? topMatch.unit : item.unit,
        price: topMatch ? topMatch.price : null,
        productId: topMatch ? topMatch.id : null,
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
  const handleOptionSelect = async (itemId, optionIndex) => {
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
      productId: selectedOption.id,
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

  // Handle Enter key press
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

  // Proceed to checkout (future implementation)
  const handleCheckout = () => {
    createOrderFromCart();
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await fetch('/logout', {
        method: 'POST',
        credentials: 'include'
      });
      navigate('/', { replace: true }); // Use replace to prevent history stacking
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  // Toggle order settings modal
  const toggleOrderSettings = () => {
    setShowOrderSettings(!showOrderSettings);
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
          <div className="cart-total">סה"כ: {total.toFixed(2)}₪</div>
          <div className="cart-actions">
            <button className="add-item-button" onClick={handleAddAnotherItem}>
              <FiPlus size={16} /> הוסף פריט נוסף
            </button>
            <button className="checkout-button" onClick={handleCheckout}>
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

  // Order Settings Modal
  const OrderSettingsModal = () => {
    if (!showOrderSettings) return null;
    
    return (
      <div className="user-info-modal">
        <div className="user-info-content">
          <h3>הגדרות הזמנה</h3>
          
          <div className="form-group" style={{ marginBottom: '15px' }}>
            <label htmlFor="maxParticipants">מספר משתתפים מקסימלי:</label>
            <select 
              id="maxParticipants" 
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(parseInt(e.target.value))}
              className="settings-input"
            >
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
            </select>
          </div>
          
          <div className="form-group" style={{ marginBottom: '15px' }}>
            <label htmlFor="deliveryDate">תאריך משלוח:</label>
            <input 
              id="deliveryDate" 
              type="datetime-local" 
              value={deliveryDate || ''}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="settings-input"
            />
          </div>
          
          <button className="close-button" onClick={toggleOrderSettings}>שמור</button>
        </div>
      </div>
    );
  };

  // Example grocery items with each item on a separate line
  const exampleItems = [
    "2 חלב תנובה 3%",
  ];

  // If authentication check is still in progress, show loading
  if (!isAuthChecked) {
    return <div className="loading-container">טוען...</div>;
  }

  return (
    <div className="app-container">
      <div className="header">
        <div className="app-title">Market Buddy</div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button className="action-btn small" onClick={() => navigate('/chat', { replace: true })} title="הזמנות">
            הזמנות
          </button>
          <button 
            className="action-btn small logout" 
            onClick={handleLogout} 
            title="התנתק"
            style={{ backgroundColor: '#dc3545' }}
          >
            התנתק
          </button>
          <button className="user-button" onClick={toggleOrderSettings} title="הגדרות הזמנה">
            <FiSettings size={20} />
          </button>
          <button className="user-button" onClick={() => setShowUserInfo(true)} title="פרטי משתמש">
            <FiUser size={20} />
          </button>
        </div>
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
            {/* Order information */}
            {currentOrder && (
              <div className="order-info">
                <h3>פרטי הזמנה #{currentOrder.order_id}</h3>
                <p>סופרמרקט: {currentOrder.supermarket}</p>
                <p>מספר משתתפים: {currentOrder.max_participants}</p>
              </div>
            )}
            
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
              <h3>ברוך הבא {user?.name || ''} לעוזר הקניות!</h3>
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
              
              <div style={{ marginTop: '20px', textAlign: 'center' }}>
                <button 
                  className="action-btn" 
                  onClick={toggleOrderSettings}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                >
                  <FiSettings size={16} /> הגדרות הזמנה
                </button>
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

      {/* User Info Modal */}
      {showUserInfo && (
        <div className="user-info-modal">
          <div className="user-info-content">
            <h3>פרטי משתמש</h3>
            {user ? (
              <>
                <p>שם: {user.name}</p>
                <p>דוא"ל: {user.email}</p>
                <p>סופרמרקט מועדף: {user.supermarket}</p>
                <button className="close-button" onClick={() => setShowUserInfo(false)}>סגור</button>
                <button 
                  className="close-button" 
                  onClick={handleLogout} 
                  style={{ marginTop: '10px', backgroundColor: '#dc3545' }}
                >
                  התנתק
                </button>
              </>
            ) : (
              <>
                <p>אינך מחובר למערכת</p>
                <button 
                  className="close-button" 
                  onClick={() => { 
                    setShowUserInfo(false);
                    navigate('/');
                  }}
                >
                  התחבר
                </button>
              </>
            )}
          </div>
        </div>
      )}
      
      {/* Order Settings Modal */}
      <OrderSettingsModal />
    </div>
  );
};

export default Chat;