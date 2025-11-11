# EmailJS Setup for Feedback Emails

To enable feedback emails to be sent to `regullasthish@gmail.com`, follow these steps:

## 1. Sign up for EmailJS
- Go to https://www.emailjs.com
- Sign up for a free account (free tier includes 200 emails/month)

## 2. Create an Email Service
- In your EmailJS dashboard, click "Email Services"
- Click "Create New Service"
- Choose **Gmail** (or your email provider)
- Follow the steps to connect your Gmail account (or use a service template)
- After setup, you'll get a **Service ID** (e.g., `service_abc123`)
- **Save this Service ID**

## 3. Create an Email Template
- In EmailJS dashboard, click "Email Templates"
- Click "Create New Template"
- Configure:
  - **Name**: e.g., `feedback_template`
  - **Subject**: `New To-Do App Feedback`
  - **Body** (use these template variables):
    ```
    From: {{user_email}}
    Timestamp: {{timestamp}}
    
    Message:
    {{message}}
    ```
  - **To Email**: `regullasthish@gmail.com`
- After creation, you'll get a **Template ID** (e.g., `template_xyz789`)
- **Save this Template ID**

## 4. Get Your Public Key
- In EmailJS dashboard, go to **Account**
- Under "General" tab, find your **Public Key** (e.g., `pk_abc123def456...`)
- **Copy your Public Key**

## 5. Update the Code
In `js/app.js`, find the line:
```javascript
emailjs.init('YOUR_EMAILJS_PUBLIC_KEY');
```

Replace `YOUR_EMAILJS_PUBLIC_KEY` with your actual public key:
```javascript
emailjs.init('pk_your_actual_public_key_here');
```

Also in the `feedbackForm.addEventListener('submit', ...)` function, update:
```javascript
emailjs.send('YOUR_SERVICE_ID', 'YOUR_TEMPLATE_ID', templateParams)
```

Replace with your actual IDs:
```javascript
emailjs.send('service_abc123', 'template_xyz789', templateParams)
```

## 6. Test It
1. Open your app in the browser
2. Click the 💬 **Feedback** button
3. Enter some test feedback and click **Send**
4. Check `regullasthish@gmail.com` inbox for the email

## Notes
- Free EmailJS tier: 200 emails/month (should be plenty for a small app)
- Emails are sent from EmailJS servers, not directly from your email
- User's email in the feedback is captured as `Guest User` or their actual email if available
- Feedback is also saved locally in localStorage as a backup
