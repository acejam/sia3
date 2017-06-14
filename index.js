import axios from 'axios';
var express  = require('express');
var config = require('./config');
var app      = express();
var mongoose = require('mongoose');
var passport = require('passport');
var flash    = require('connect-flash');
const logging = require('./lib/logging');

var configDB = config.mongo_db;
var port     = config.port;
mongoose.connect(configDB); // connect to our database

var cookieParser = require('cookie-parser');
var bodyParser   = require('body-parser');
var session      = require('express-session');
var RedisStore = require('connect-redis')(session);

const siad = axios.create ({
    baseURL: 'http://localhost:9980',
    timeout: 120000,
    json: true,
    headers: {'User-Agent': 'Sia-Agent'}
  });
siad.defaults.headers.common['User-Agent'] = 'Sia-Agent'

siad.get('/wallet').then((response) => {
  if (!response.data.encrypted){
    //I think this is the indication that the wallet is not initialized? 
    siad.post('/wallet/init/seed?encryptionpassword='+config.sia_password+"&seed="+config.sia_password).then(() => {
      console.log('Successfully initialized wallet');
    }).catch((err) => {
      console.log('Unable to initialize wallet: ', err);
    });
  }
  if (!response.data.unlocked){
    //TODO email someone if there are no funds 
    console.log('Found wallet locked');
    siad.post('/wallet/unlock?encryptionpassword=' + config.sia_password).then(() => {
      console.log('Successfully unlocked wallet');
    }).catch((err) => {
      console.log('Unable to unlock wallet: ' + err);
    });
  }
}).catch((err) => {
  console.log('Unable to describe wallet' + err);
});

siad.post('/renter?funds=1118199217560000000000000000&period=8820&renewwindow=1000').then(() => {
  console.log('Updated renter funds');
}).catch((err)=> {
  console.log('An error has occured updating wallet funds configuration: \n' + err);
})

// set up our express application
app.use(cookieParser()); // read cookies (needed for auth)
app.use(bodyParser.json()); // get information from html forms
app.use(bodyParser.urlencoded({ extended: true }));
app.use(logging.requestLogger);
app.use(logging.errorLogger);

require('./config/passport')(passport); // pass passport for configuration

const sessionConfig = {
    secret: config.session_secret, // session secret
    resave: true,
    saveUninitialized: true,
}

if (config.redis_url) {
    var redis = require('redis-url').connect(config.redis_url);
    sessionConfig.store = new RedisStore({client: redis});
}

// required for passport
app.use(session(sessionConfig));

app.use(passport.initialize());
app.use(passport.session()); // persistent login sessions
app.use(flash()); // use connect-flash for flash messages stored in session

app.set('port', port);

app.use(express.static(__dirname + '/public', {maxAge : "30d"}));

// views is directory for all template files
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

app.get('/', function(request, response) {
  response.render('pages/index');
});

require('./app/routes.js')(app, passport, siad); // load our routes and pass in our app and fully configured passport

app.listen(app.get('port'), function() {
  console.log('Sia3 is running on port: ', app.get('port'));
});