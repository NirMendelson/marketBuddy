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

exports.sendEmail = async (to, subject, text) => {
  try {
    await transporter.sendMail({
      from: `"MarketBuddy" <${process.env.EMAIL_ADDRESS}>`,
      to,
      subject,
      text
    });

    console.log(`📧 Email sent to ${to}`);
  } catch (error) {
    console.error(`❌ Failed to send email to ${to}:`, error);
  }
};
