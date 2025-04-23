const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.zoho.com', // If using Zoho Mail
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_ADDRESS, // hello@marketbuddy.dev
    pass: process.env.EMAIL_PASSWORD // App-specific password from Zoho
  }
});

const createNearbyOrderEmail = ({
  firstName,
  address,
  deliveryDate,
  deliveryTime,
  supermarket,
  orderId
}) => {
  return `שלום ${firstName},

קיימת הזמנה חדשה באיזור שלך.

<strong>מיקום:</strong> ${address}

<strong>תאריך ושעה:</strong> ${deliveryDate}, ${deliveryTime}

<strong>הזמנה מסופרמרקט:</strong> ${supermarket}

ניתן להוסיף עד 10 מוצרים ולשלם עלות משלוח של 10 ש"ח בלבד

<a href="http://localhost:3000/orders/${orderId}" style="color: #0066cc; text-decoration: none;">לינק להצטרפות</a>

בברכה,
צוות MarketBuddy`;
};

const sendEmail = async (to, subject, text) => {
  try {
    const html = `
      <div style="direction: rtl; text-align: right; font-family: Arial, sans-serif;">
        <div style="right: 0;">
          ${text.split('\n').map(line => {
            if (line.includes('<a href=') || line.includes('<strong>')) {
              return `<p style="margin: 10px 0;">${line}</p>`;
            }
            return `<p style="margin: 10px 0;">${line}</p>`;
          }).join('')}
        </div>
      </div>
    `;

    const mailOptions = {
      from: process.env.EMAIL_ADDRESS,
      to,
      subject,
      html
    };

    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully to:', to);
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

module.exports = { sendEmail, createNearbyOrderEmail };
