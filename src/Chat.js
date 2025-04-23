import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./Chat.css";
import { FiSend, FiUser, FiPlus, FiCheck, FiShoppingCart, FiAlertTriangle, FiHelpCircle, FiCalendar, FiUsers, FiSettings } from "react-icons/fi";

// API client function to call backend
const processGroceryList = async (message, maxParticipants = 1, deliveryDate = null) => {
  try {
    console.log('Starting processGroceryList with message:', message);
    
    // Call the backend API endpoint to create an order
    const response = await fetch('/orders/process-list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include', // Important for sessions
      body: JSON.stringify({ 
        message
      })
    });
    
    console.log('Server response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Server error response:', {
        status: response.status,
        statusText: response.statusText,
        errorText: errorText
      });
      throw new Error(errorText || `API error: ${response.status}`);
    }
    
    const responseData = await response.json();
    console.log('Server response data:', responseData);
    return responseData;
  } catch (error) {
    console.error('Error in processGroceryList:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
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
  const [showOrderSettings, setShowOrderSettings] = useState(false);
  const messagesEndRef = useRef(null);

  // Add scroll debugging
  useEffect(() => {
    // preserve originals
    window._origScrollTo = window.scrollTo;
    Element.prototype._origScrollIntoView = Element.prototype.scrollIntoView;

    // override with trace
    window.scrollTo = function() {
      console.trace('window.scrollTo called with', arguments);
      return window._origScrollTo.apply(this, arguments);
    };

    Element.prototype.scrollIntoView = function() {
      console.trace('element.scrollIntoView called on', this);
      return this._origScrollIntoView.apply(this, arguments);
    };

    // Cleanup on unmount
    return () => {
      window.scrollTo = window._origScrollTo;
      Element.prototype.scrollIntoView = Element.prototype._origScrollIntoView;
    };
  }, []);

  // Scroll effect that only runs when message count changes
  useEffect(() => {
    console.trace('scrolling to bottom; new message count:', messages.length);
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  const adjustTextareaHeight = (textarea) => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  };

  const handleMessageChange = (e) => {
    setMessage(e.target.value);
    adjustTextareaHeight(e.target);
  };

  // Creates a new order with all the items currently in the shopping cart
  const createOrderFromCart = async (orderMaxParticipants, orderDeliveryDate, orderDeliveryTime) => {
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
  
      // Format the cart items for storage
      const itemsToStore = selectedItems.map(item => ({
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        unit: item.unit
      }));
  
      // Format the date to YYYY-MM-DD
      const [day, month, year] = orderDeliveryDate.split('.');
      const formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  
      // Format the time to HH:MM-HH:MM
      console.log('Original delivery time:', orderDeliveryTime);
      console.log('Delivery time type:', typeof orderDeliveryTime);
      console.log('Delivery time structure:', JSON.stringify(orderDeliveryTime, null, 2));
      
      let formattedTime;
      if (typeof orderDeliveryTime === 'object' && orderDeliveryTime.start && orderDeliveryTime.end) {
        formattedTime = `${orderDeliveryTime.start}-${orderDeliveryTime.end}`;
        console.log('Using time range from object:', formattedTime);
      } else if (typeof orderDeliveryTime === 'string') {
        formattedTime = orderDeliveryTime;
        console.log('Using time range from string:', formattedTime);
      } else {
        console.error('Invalid delivery time format:', orderDeliveryTime);
        throw new Error('Invalid delivery time format');
      }

      console.log('Formatted delivery date:', formattedDate);
      console.log('Formatted delivery time:', formattedTime);
      
      // Calculate the total
      const deliveryFee = 30.0;
      const subtotal = selectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const total = subtotal + deliveryFee;
      
      // Store cart items and order details in localStorage
      localStorage.setItem("cartItems", JSON.stringify(itemsToStore));
      localStorage.setItem("orderDetails", JSON.stringify({
        supermarket: user?.supermarket || 'רמי לוי',
        maxParticipants: orderMaxParticipants,
        deliveryDate: formattedDate,
        deliveryTime: formattedTime
      }));
      localStorage.setItem("orderTotal", total.toFixed(2));
      
      console.log('Stored order details:', {
        supermarket: user?.supermarket || 'רמי לוי',
        maxParticipants: orderMaxParticipants,
        deliveryDate: formattedDate,
        deliveryTime: formattedTime,
        total: total.toFixed(2)
      });
  
      // Add success message
      setMessages(msgs => [...msgs, { 
        text: `✅ העגלה נשמרה בהצלחה!
מספר פריטים: ${itemsToStore.length}
סופרמרקט: ${user?.supermarket || 'רמי לוי'}`, 
        sender: "ai" 
      }]);
      
      // Navigate to Payment with total as URL parameter
      navigate(`/payment?total=${total.toFixed(2)}`);
  
    } catch (error) {
      console.error('Error saving cart:', error);
      setMessages(msgs => [...msgs, { 
        text: `שגיאה בשמירת העגלה: ${error.message}`, 
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
          console.log('User data from check-auth:', data);
          if (data.isAuthenticated) {
            setUser(data.user);
            console.log('User data from users table:', data.user);
          } else {
            // Redirect to login if not authenticated
            navigate('/');
          }
        }
      } catch (error) {
        console.error('Error checking authentication:', error);
        navigate('/');
      }
    };
    
    checkAuth();
  }, [navigate]);
  
  // Helper function to generate delivery time options
  const generateDeliveryOptions = () => {
    const options = [];
    const today = new Date();
    
    // Generate options for next 7 days (excluding Friday and Saturday)
    for (let i = 1; i <= 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      
      // Skip Friday and Saturday
      if (date.getDay() === 5 || date.getDay() === 6) continue;
      
      const dayName = date.toLocaleDateString('he-IL', { weekday: 'long' });
      const dateStr = date.toLocaleDateString('he-IL');
      
      options.push({
        date: dateStr,
        dayName: dayName,
        timeSlots: [
          { start: '08:00', end: '12:00' },
          { start: '14:00', end: '18:00' },
          { start: '18:00', end: '22:00' }
        ]
      });
    }
    
    return options;
  };

  // Delivery Options Component
  const DeliveryOptions = ({ options, onSelect }) => {
    const [selectedDate, setSelectedDate] = useState(null);
    const [selectedTime, setSelectedTime] = useState(null);

    const handleDateSelect = (date) => {
      setSelectedDate(date);
      setSelectedTime(null);
    };

    const handleTimeSelect = (time) => {
      setSelectedTime(time);
    };

    const handleConfirm = () => {
      if (selectedDate && selectedTime) {
        // Pass date and time separately
        onSelect(selectedDate, selectedTime);
      }
    };

    return (
      <div className="delivery-options">
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
        
        {selectedTime && (
          <button className="confirm-delivery" onClick={handleConfirm}>
            <FiCheck size={20} /> אישור
          </button>
        )}
      </div>
    );
  };

  const handleSend = async () => {
    if (message.trim() !== "") {
      console.log('Starting handleSend with message:', message);
      
      // Set hasSubmittedOrder to true when first message is sent
      if (!hasSubmittedOrder) {
        setHasSubmittedOrder(true);
      }
      
      // Add user message to chat
      const userMessage = message;
      setMessages([...messages, { text: userMessage, sender: "user" }]);
      setMessage(""); // Clear input field immediately for better UX
      
      // Reset textarea height
      const textarea = document.querySelector('.chat-input');
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = '20px'; // Set to minimum height
      }
      
      // Check if user wants to finish the order
      if (userMessage.toLowerCase() === 'סיים' || userMessage.toLowerCase() === 'סיום') {
        console.log('User requested to finish order');
        if (groceryItems.length === 0) {
          setMessages(msgs => [...msgs, { 
            text: "אין פריטים בעגלה. אנא הוסף פריטים לפני סיום ההזמנה.", 
            sender: "ai" 
          }]);
          return;
        }
        
        // Show delivery time options
        const deliveryOptions = generateDeliveryOptions();
        setMessages(msgs => [...msgs, { 
          text: "בחר זמן משלוח:",
          sender: "ai",
          isDeliveryOptions: true,
          deliveryOptions: deliveryOptions
        }]);
        return;
      }
      
      // Check if user is selecting a delivery time
      if (userMessage.match(/^\d{2}:\d{2}-\d{2}:\d{2}$/)) {
        console.log('User selected delivery time:', userMessage);
        // TODO: Handle delivery time selection and proceed to payment
        setMessages(msgs => [...msgs, { 
          text: "מעביר אותך לדף התשלום...", 
          sender: "ai" 
        }]);
        // Navigate to payment page
        navigate('/payment');
        return;
      }
      
      setIsProcessing(true);
      
      try {
        console.log('Calling processGroceryList API with message:', userMessage);
        
        // Call API to process grocery list
        const apiResponse = await processGroceryList(
          userMessage,
          1,
          null
        );
        
        console.log('API Response:', apiResponse);
        
        // Set the current order if it doesn't exist
        if (!currentOrder) {
          setCurrentOrder(apiResponse.order);
        }
        
        // Get the processed items from the API response
        const aiResponse = apiResponse.groceryList;
        console.log('AI Response:', aiResponse);
        
        if (aiResponse.items && aiResponse.items.length > 0) {
          console.log('Processing items:', aiResponse.items);
          
          // Convert the response format to match what the frontend expects
          const processedItems = aiResponse.items.map(item => ({
            isCertain: item.isCertain,
            matchedProducts: item.matchedProducts || [],
            product: item.product,
            quantity: item.quantity,
            unit: item.unit || 'יחידה', // Default to 'יחידה' if unit is undefined
            confidence: item.confidence
          }));
          
          console.log('Processed items:', processedItems);
          
          // Separate items into categories
          const certain = processedItems.filter(item => item.isCertain);
          const uncertain = processedItems.filter(item => !item.isCertain && item.matchedProducts && item.matchedProducts.length > 0);
          const notFound = processedItems.filter(item => !item.matchedProducts || item.matchedProducts.length === 0);
          
          console.log('Items categories:', { certain, uncertain, notFound });
          
          // Add the certain items to the grocery list
          updateGroceryItems(certain);
          
          // Store not found items
          setNotFoundItems(notFound);
          
          // Set pending options for uncertain items
          const formattedOptions = uncertain.map(item => ({
            id: Date.now() + Math.random(),
            originalItem: item,
            product: item.matchedProducts[0].name, // Use the matched product name
            quantity: item.quantity,
            unit: item.unit,
            options: item.matchedProducts
          }));
          
          setPendingOptions(formattedOptions);
          
          // Format response messages based on processing results
          let responseText = "";
          
          // Only show order summary if there are no items that need selection
          if (uncertain.length === 0) {
            // Add order summary and instructions
            const deliveryFee = 30.0;
            const subtotal = groceryItems.reduce((sum, item) => sum + (item.price * item.quantity), 0) + 
                            certain.reduce((sum, item) => sum + (item.matchedProducts[0].price * item.quantity), 0);
            const total = subtotal + deliveryFee;
            
            console.log('Order Summary - Grocery Items:', groceryItems.map(item => ({
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
              unit_measure: item.unit_measure,
              price: item.price
            })));
            
            console.log('Order Summary - New Items:', certain.map(item => ({
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
              matchedProduct: item.matchedProducts[0]
            })));
            
            // Add existing items
            groceryItems.forEach(item => {
              console.log('Adding grocery item to summary:', {
                name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                unit_measure: item.unit_measure,
                price: item.price
              });
              responseText += `- ${item.quantity} ${item.unit} ${item.name} - ${item.price}₪\n`;
            });
            
            // Add new items
            certain.forEach(item => {
              console.log('Adding new item to summary:', {
                name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                matchedProduct: item.matchedProducts[0]
              });
              responseText += `- ${item.quantity} ${item.unit} ${item.name} - ${item.matchedProducts[0].price}₪\n`;
            });
            
            console.log('Final order summary text:', responseText);
            
            responseText += `\n- משלוח - ${deliveryFee}₪\n`;
            responseText += `סה"כ לתשלום: ${total.toFixed(2)}₪\n\n`;
            responseText += `לסיום ההזמנה הקלד "סיים"`;
          }
          
          console.log('Adding response message:', responseText);
          
          // Add the formatted response to chat if there's content
          if (responseText) {
            setMessages(msgs => [...msgs, { 
              text: responseText, 
              sender: "ai" 
            }]);
          }
          
          // Show options selection UI only if we have uncertain items with multiple options
          if (uncertain.length > 0) {
            setMessages(msgs => [...msgs, { 
              text: "אנא בחר את האפשרות המתאימה עבור כל פריט:",
              sender: "ai",
              isOptions: true,
              options: formattedOptions
            }]);
          }
        } else {
          console.log('No items found in response');
          setMessages(msgs => [...msgs, { 
            text: "לא הצלחתי לזהות פריטים ברשימה שלך. אנא נסה שוב עם פורמט אחר או הוסף פרטים נוספים.", 
            sender: "ai" 
          }]);
        }
        
      } catch (error) {
        console.error("Error processing grocery list:", {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
        setMessages(msgs => [...msgs, { 
          text: `שגיאה בעיבוד הרשימה: ${error.message}. אנא נסה שוב או פנה לתמיכה.`, 
          sender: "ai" 
        }]);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  // Helper function to calculate total
  const calculateTotal = () => {
    const deliveryFee = 30.0;
    const subtotal = groceryItems
      .filter(item => item.selected)
      .reduce((sum, item) => sum + (item.price * item.quantity), 0);
    return (subtotal + deliveryFee).toFixed(2);
  };

  // Update the grocery items state with the processed items
  const updateGroceryItems = (items) => {
    console.log('Creating grocery items:', items);
    
    const newItems = items.map(item => {
      // Create a new item object for our state
      const topMatch = item.matchedProducts && item.matchedProducts.length > 0 ? item.matchedProducts[0] : null;
      
      console.log('Creating new grocery item:', {
        originalItem: item,
        topMatch: topMatch,
        unit_measure: topMatch ? topMatch.unit_measure : null,
        size: topMatch ? topMatch.size : null
      });
      
      // Always use the matched product name and details
      const newItem = {
        id: Date.now() + Math.random(), // Generate a unique ID
        name: topMatch ? topMatch.name : item.product, // Use the matched product name if available
        quantity: item.quantity,
        unit: topMatch ? topMatch.unit_measure : item.unit,
        price: topMatch ? topMatch.price : 0,
        productId: topMatch ? topMatch.id : null,
        isCertain: true,
        selected: true,
        alternativeOptions: item.matchedProducts || [],
        reasonForMatch: item.reasonForMatch || null
      };
      
      console.log('Created item:', newItem);
      return newItem;
    });
    
    console.log('New items to add:', newItems);
    
    // Add the new items to our grocery list
    setGroceryItems(prev => {
      const updated = [...prev, ...newItems];
      console.log('Updated grocery items:', updated);
      return updated;
    });
  };

  // Handle option click with focus prevention
  const handleOptionClick = (e, itemId, optionIndex) => {
    e.preventDefault();
    // Now that it never receives focus, the browser can't auto-scroll to it
    handleOptionSelect(itemId, optionIndex);
  };

  const handleOptionSelect = (itemId, optionIndex) => {
    const item = pendingOptions.find(item => item.id === itemId);
    if (!item) return;
    
    console.log('Option selected:', {
      optionId: itemId,
      optionIndex: optionIndex,
      selectedOption: item.options[optionIndex],
      unit_measure: item.options[optionIndex].unit_measure,
      size: item.options[optionIndex].size
    });
    
    setPendingOptions(prev => 
      prev.map(item => 
        item.id === itemId 
          ? { ...item, selectedOption: optionIndex }
          : item
      )
    );
  };

  const handleConfirmAll = () => {
    // Add all selected items to the grocery list
    const selectedItems = pendingOptions
      .filter(item => item.selectedOption !== undefined)
      .map(item => {
        const selectedOption = item.options[item.selectedOption];
        return {
          id: Date.now() + Math.random(),
          name: selectedOption.name,
          quantity: item.quantity,
          unit: selectedOption.unit_measure,
          price: selectedOption.price,
          productId: selectedOption.id,
          isCertain: true,
          selected: true
        };
      });

    // Add the selected items to the grocery list
    setGroceryItems(prev => [...prev, ...selectedItems]);
    
    // Clear the pending options
    setPendingOptions([]);
    
    // Calculate totals
    const deliveryFee = 30.0;
    const subtotal = selectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const total = subtotal + deliveryFee;
    
    // Add order summary message
    let summaryText = "סיכום הזמנה:\n\n";
    
    selectedItems.forEach(item => {
      summaryText += `- ${item.quantity} ${item.unit} ${item.name} - ${item.price}₪\n`;
    });
    
    summaryText += `\n- משלוח - ${deliveryFee}₪\n`;
    summaryText += `סה"כ לתשלום: ${total.toFixed(2)}₪\n\n`;
    summaryText += `לסיום ההזמנה הקלד "סיים"`;
    
    setMessages(msgs => [...msgs, { 
      text: summaryText, 
      sender: "ai" 
    }]);
  };

  // Handle removing an item from the grocery list
  const handleRemoveItem = (itemId) => {
    setGroceryItems(items => items.filter(item => item.id !== itemId));
    
    // Reset textarea height
    const textarea = document.querySelector('.chat-input');
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = '20px'; // Set to minimum height
    }
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

  

  // Handle logout
  const handleLogout = async () => {
    try {
      await fetch('/logout', {
        method: 'POST',
        credentials: 'include'
      });
      navigate('/');
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  // Toggle order settings modal
  const toggleOrderSettings = () => {
    setShowOrderSettings(!showOrderSettings);
  };

  // Update the OptionButtons component
  const OptionButtons = ({ item }) => {
    // Format the option text with name, brand, size, and unit measure
    const formatOptionText = (option) => {
      const parts = [option.name];
      
      if (option.brand) {
        parts.push(option.brand);
      }
      
      if (option.size && option.unit_measure) {
        parts.push(`${option.size} ${option.unit_measure}`);
      } else if (option.size) {
        parts.push(`${option.size}`);
      } else if (option.unit_measure) {
        parts.push(`${option.unit_measure}`);
      }
      
      return parts.join(', ');
    };

    // Auto-select the first option if there's only one
    useEffect(() => {
      if (item.options.length === 1 && item.selectedOption === undefined) {
        handleOptionSelect(item.id, 0);
      }
    }, [item.id, item.options.length, item.selectedOption]);

    return (
      <div className="option-buttons">
        <div className="option-product">{item.originalItem.product}</div>
        <div className="option-list">
          {item.options.map((option, index) => (
            <button 
              type="button"
              key={index} 
              className={`option-button ${item.selectedOption === index ? 'selected' : ''}`}
              onMouseDown={e => e.preventDefault()}
              onClick={e => handleOptionClick(e, item.id, index)}
            >
              {item.selectedOption === index && <FiCheck size={14} className="ai-pick" />} 
              {formatOptionText(option)} - {option.price}₪
            </button>
          ))}
        </div>
      </div>
    );
  };

  // Create a component for displaying the grocery cart
  const GroceryCart = () => {
    
    const [orderMaxParticipants, setOrderMaxParticipants] = useState(1);
    const [orderDeliveryDate, setOrderDeliveryDate] = useState(() => {
      const now = new Date(Date.now() + 3600000); // 1 hour from now
      return now.toISOString().slice(0, 16); // format to datetime-local input
    });

    
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
    

    const deliveryFee = 30.0;
    const subtotal = selectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const total = subtotal + deliveryFee;
    
    // Proceed to checkout (future implementation)
    const handleCheckout = () => {
    createOrderFromCart(orderMaxParticipants, orderDeliveryDate, null);
    };

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
          <div className="cart-total">סה"כ: {total.toFixed(2)}₪</div>
          <div className="form-group">
            <label htmlFor="orderMaxParticipants">משתתפים מקסימליים:</label>
            <select
              id="orderMaxParticipants"
              value={orderMaxParticipants}
              onChange={(e) => setOrderMaxParticipants(parseInt(e.target.value))}
              className="settings-input"
            >
              {[1, 2, 3, 4].map(num => (
                <option key={num} value={num}>{num}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginTop: '10px' }}>
            <label htmlFor="orderDeliveryDate">תאריך משלוח:</label>
            <input
              type="datetime-local"
              id="orderDeliveryDate"
              value={orderDeliveryDate}
              onChange={(e) => setOrderDeliveryDate(e.target.value)}
              min={new Date(Date.now() + 3600000).toISOString().slice(0, 16)} // 1 hour in the future
              className="settings-input"
            />
          </div>
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
          
          <p style={{ textAlign: 'center' }}>הגדרות אישיות יתווספו בקרוב.</p>
          
          <button className="close-button" onClick={toggleOrderSettings}>שמור</button>
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

  useEffect(() => {
    const deliveryFee = 30.0;
    const subtotal = groceryItems
      .filter(item => item.selected)
      .reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const total = subtotal + deliveryFee;
  
    localStorage.setItem("orderTotal", total.toFixed(2));
  }, [groceryItems]);
  

  return (
    <div className="app-container">
      <div className="header">
        <div className="app-title">Market Buddy</div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button className="action-btn small" onClick={() => navigate('/chat')} title="הזמנות">
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

      <div className="main-content centered">
        <div className="centered-container">
          {!hasSubmittedOrder ? (
            <div className="welcome-message">
              <h3>ברוך הבא {user?.name?.split(' ')[0] || ''} לעוזר הקניות!</h3>
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
                <div className="example-item">{exampleItems[0]}</div>
              </div>
            </div>
          ) : (
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
                      <button 
                        className="confirm-delivery" 
                        onClick={handleConfirmAll}
                        disabled={!pendingOptions.some(item => item.selectedOption !== undefined)}
                      >
                        <FiCheck size={20} /> אישור
                      </button>
                    </div>
                  )}
                  
                  {/* Render delivery options if this is a delivery options message */}
                  {msg.isDeliveryOptions && msg.deliveryOptions && (
                    <DeliveryOptions 
                      options={msg.deliveryOptions}
                      onSelect={(date, time) => {
                        setMessages(msgs => [...msgs, { 
                          text: "מעביר אותך לדף התשלום...", 
                          sender: "ai" 
                        }]);
                        createOrderFromCart(1, date, time);
                      }}
                    />
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
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
          
          {hasSubmittedOrder && <OrderStatusSummary />}
        </div>
      </div>

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