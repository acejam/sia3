const fs = require('fs');
import axios from 'axios';

const Gb = 1000*1000*1000;
const config = {};

config.mongo_db = process.env.MONGO_URL;
config.redis_url = process.env.REDIS_URL;
config.session_secret = process.env.SESSION_SECRET || 'asdpouiqwerlmxnclbhpoiquwerk';
config.port = process.env.PORT || 8080;
config.sia_password = process.env.SIA_PASSWORD;
config.google = {};

config.google.client_id = process.env.GOOGLE_OAUTH_ID;
config.google.client_secret = process.env.GOOGLE_OAUTH_KEY;
config.google.callback_url = process.env.GOOGLE_OAUTH_CALLBACK;

config.tmpDir = '/tmp/sia3';

config.lruOptions = {
    max: Gb * 50, //should be 50Gb /shruggie
    length: function (hash, file) { return file.size; },
    dispose: function (hash) { fs.unlink(config.tmpDir + "/" + hash); }
};

config.siad = axios.create ({
    baseURL: 'http://localhost:9980',
    timeout: 120000,
    json: true,
    headers: {'User-Agent': 'Sia-Agent'}
});
config.maxFileSize = Gb;




config.sessionConfig = {
    secret: config.session_secret, // session secret
    resave: true,
    saveUninitialized: true,
};

module.exports = config;