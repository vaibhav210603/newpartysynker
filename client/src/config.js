// config.js
// Switch between local and production server

const USE_PROD = true; // Set to true for production

export const SERVER_URL = USE_PROD
  ? 'https://ps.api.vibhaupadhyay.com'
  : 'http://localhost:5000'; 