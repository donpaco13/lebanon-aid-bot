// src/services/twilio.js
const twilio = require('twilio');

let client = null;

function getClient() {
  if (client) return client;
  client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return client;
}

async function sendMessage(to, body) {
  return getClient().messages.create({
    from: process.env.TWILIO_PHONE_NUMBER,
    to,
    body,
  });
}

function validateRequest(authToken, signature, url, params) {
  return twilio.validateRequest(authToken, signature, url, params);
}

function parseTwilioBody(body) {
  const numMedia = parseInt(body.NumMedia || '0', 10);
  const hasMedia = numMedia > 0;
  const location = (body.Latitude && body.Longitude)
    ? { lat: parseFloat(body.Latitude), lng: parseFloat(body.Longitude) }
    : null;

  return {
    text: (body.Body || '').trim(),
    from: body.From || '',
    hasMedia,
    mediaType: hasMedia ? body.MediaContentType0 : null,
    mediaUrl: hasMedia ? body.MediaUrl0 : null,
    location,
  };
}

module.exports = { sendMessage, validateRequest, parseTwilioBody };
