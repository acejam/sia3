const express  = require('express');
const config = require('./config');
const mongoose = require('mongoose');
const passport = require('passport');
const flash    = require('connect-flash');
const logging = require('./lib/logging');
const compression = require('compression');
const app      = express();

var configDB = config.mongo_db;
var port     = config.port;
mongoose.connect(configDB); // connect to our database

var cookieParser = require('cookie-parser');
var bodyParser   = require('body-parser');
var session      = require('express-session');
var RedisStore = require('connect-redis')(session);

config.siad.get('/wallet').then((response) => {
  if (!response.data.encrypted){
    //I think this is the indication that the wallet is not initialized? 
    config.siad.post('/wallet/init/seed?encryptionpassword='+config.sia_password+"&seed="+config.sia_password).then(() => {
      console.log('Successfully initialized wallet');
    }).catch((err) => {
      console.log('Unable to initialize wallet: ', err);
    });
  }
  if (!response.data.unlocked){
    //TODO email someone if there are no funds 
    console.log('Found wallet locked');
    config.siad.post('/wallet/unlock?encryptionpassword=' + config.sia_password).then(() => {
      console.log('Successfully unlocked wallet');
    }).catch((err) => {
      console.log('Unable to unlock wallet: ' + err);
    });
  }
}).catch((err) => {
  console.log('Unable to describe wallet' + err);
});

config.siad.post('/renter?funds=3905000000000000000000000000000&period=4032&renewwindow=1000').then(() => {
  console.log('Updated renter funds');
}).catch((err)=> {
  console.log('An error has occured updating wallet funds configuration: \n' + err);
});

// set up our express application
app.use(cookieParser()); // read cookies (needed for auth)
app.use(bodyParser.json()); // get information from html forms
app.use(bodyParser.urlencoded({ extended: true }));
app.use(logging.requestLogger);
app.use(logging.errorLogger);
app.use(compression());


require('./config/passport')(passport); // pass passport for configuration

if (config.redis_url) {
    var redis = require('redis-url').connect(config.redis_url);
    config.sessionConfig.store = new RedisStore({client: redis});
}

// required for passport
app.use(session(config.sessionConfig));

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

require('./app/routes.js')(app, passport); // load our routes and pass in our app and fully configured passport

app.listen(app.get('port'), function() {
  console.log('Sia3 is running on port: ', app.get('port'));
});