const nodemailer = require('nodemailer');

const oauthConfig = [
    'EMAIL_USER',
    'CLIENT_ID',
    'CLIENT_SECRET',
    'REFRESH_TOKEN',
].every((key) => Boolean(process.env[key]));

const emailPassword = process.env.EMAIL_PASSWORD?.replace(/\s+/g, '');

// Render Free blocks outbound SMTP ports. When OAuth2 values are present,
// use Gmail's HTTPS API instead of SMTP so delivery works over port 443.
const smtpTransporter = emailPassword
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: emailPassword,
        },
    })
    : null;

async function getGmailAccessToken() {
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            refresh_token: process.env.REFRESH_TOKEN,
            grant_type: 'refresh_token',
        }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.access_token) {
        const reason = payload.error_description || payload.error || `HTTP ${response.status}`;
        throw new Error(`Gmail OAuth token request failed: ${reason}`);
    }

    return payload.access_token;
}

async function sendWithGmailApi(to, subject, text, html) {
    const accessToken = await getGmailAccessToken();
    const rawMessage = [
        `From: "Backend Ledger" <${process.env.EMAIL_USER}>`,
        `To: ${to}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        html || text,
    ].join('\r\n');

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            raw: Buffer.from(rawMessage, 'utf8').toString('base64url'),
        }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.id) {
        const reason = payload.error?.message || `HTTP ${response.status}`;
        throw new Error(`Gmail API send failed: ${reason}`);
    }

    console.log('Message sent via Gmail API: %s', payload.id);
}

async function verifyEmailService() {
    if (oauthConfig) {
        try {
            await getGmailAccessToken();
            console.log('Email server is ready to send messages using Gmail HTTPS API');
        } catch (error) {
            console.error('Error connecting to Gmail HTTPS API:', error.message);
        }
        return;
    }

    if (smtpTransporter) {
        smtpTransporter.verify((error) => {
            if (error) {
                console.error('Error connecting to email server:', error);
            } else {
                console.log('Email server is ready to send messages using Gmail SMTP');
            }
        });
        return;
    }

    console.error('Email service is not configured: add Gmail OAuth2 variables');
}

void verifyEmailService();

const sendEmail = async (to, subject, text, html) => {
    try {
        if (oauthConfig) {
            await sendWithGmailApi(to, subject, text, html);
            return;
        }

        if (!smtpTransporter) {
            throw new Error('Email service is not configured');
        }

        const info = await smtpTransporter.sendMail({
            from: `"Backend Ledger" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            text,
            html,
        });

        console.log('Message sent via Gmail SMTP: %s', info.messageId);
    } catch (error) {
        console.error('Error sending email:', error.message);
    }
};

async function sendRegistrationEmail(userEmail, name) {
    const subject = 'Welcome to Backend Ledger!';
    const text = `Hello ${name},\n\nThank you for registering at Backend Ledger. We're excited to have you on board!\n\nBest regards,\nThe Backend Ledger Team`;
    const html = `<p>Hello ${name},</p><p>Thank you for registering at Backend Ledger. We're excited to have you on board!</p><p>Best regards,<br>The Backend Ledger Team</p>`;

    await sendEmail(userEmail, subject, text, html);
}

async function sendTransactionEmail(userEmail, name, amount, toAccount) {
    const subject = 'Transaction Successful!';
    const text = `Hello ${name},\n\nYour transaction of $${amount} to account ${toAccount} was successful.\n\nBest regards,\nThe Backend Ledger Team`;
    const html = `<p>Hello ${name},</p><p>Your transaction of $${amount} to account ${toAccount} was successful.</p><p>Best regards,<br>The Backend Ledger Team</p>`;

    await sendEmail(userEmail, subject, text, html);
}

async function sendTransactionFailureEmail(userEmail, name, amount, toAccount) {
    const subject = 'Transaction Failed';
    const text = `Hello ${name},\n\nWe regret to inform you that your transaction of $${amount} to account ${toAccount} has failed. Please try again later.\n\nBest regards,\nThe Backend Ledger Team`;
    const html = `<p>Hello ${name},</p><p>We regret to inform you that your transaction of $${amount} to account ${toAccount} has failed. Please try again later.</p><p>Best regards,<br>The Backend Ledger Team</p>`;

    await sendEmail(userEmail, subject, text, html);
}

module.exports = {
    sendRegistrationEmail,
    sendTransactionEmail,
    sendTransactionFailureEmail,
};
