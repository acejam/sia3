var config = {};

config.mongo_db = process.env.MONGO_URL
config.redis_url = process.env.REDIS_URL
config.session_secret = process.env.SESSION_SECRET || 'asdpouiqwerlmxnclbhpoiquwerk'
config.port = process.env.PORT || 8080;
config.sia_password = process.env.SIA_PASSWORD
config.google = {};

config.google.client_id = process.env.GOOGLE_OAUTH_ID
config.google.client_secret = process.env.GOOGLE_OAUTH_KEY
config.google.callback_url = process.env.GOOGLE_OAUTH_CALLBACK

module.exports = config;