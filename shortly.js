var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');


var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');
var bcrypt = require('bcrypt-nodejs');
var session = require('cookie-session');


var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
//Session verification modules
app.set('trust proxy', 1);
app.use(session({
  name: 'session',
  keys: ['mysecret']
}));

// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));

var isLoggedIn = function(req, res, next) {
  if (req.session.loggedIn) {
    next();
  } else {
    res.redirect('/login');
  }
};

app.get('/', isLoggedIn, function(req, res) {
  res.render('index');
});

app.get('/example', function(req, res) {
  res.send('<h1>This is some html</h1><a href="google.com">link</a>');
});

app.get('/create', isLoggedIn, function(req, res) {
  res.render('index');
});

app.get('/links', isLoggedIn, function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.status(200).send(links.models);
  });
});

app.post('/links', isLoggedIn, function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.status(200).send(found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.sendStatus(404);
        }

        Links.create({
          url: uri,
          title: title,
          baseUrl: req.headers.origin
        })
        .then(function(newLink) {
          res.status(200).send(newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

app.post('/login', function (req, res) {

  var loginInfo = req.body;

  new User({username: loginInfo.username}).fetch().then(function (user) {
    if (user) {
      bcrypt.compare(loginInfo.password, user.attributes.password, function(err, matched) {
        if (err) {
          throw err;
        }

        //set session to logged in
        if (matched) {
          req.session.loggedIn = true;
          req.session.username = loginInfo.username;
          res.redirect('/');
        } else {
          res.redirect('/login');
        }
      });
    } else {
      res.redirect('/login');
    }
  });


});

app.get('/login', function (req, res) {

  res.render('login');

});

app.post('/signup', function (req, res) {

  console.log('Body: ', req.body);

  new User({username: req.body.username}).fetch().then(function (user) {
    if (user) {
      res.status(409).send('User Already Exists');
    } else {

      Users.create({
        username: req.body.username,
        password: req.body.password
      })
      .then(function(newUser) {
        req.session.loggedIn = true;
        req.session.username = req.body.username;
        res.redirect('/');       
      });
    }
  });
});

app.get('/signup', function(req, res) {
  res.render('signup');
});

app.get('/logout', function(req, res) {

  req.session.loggedIn = false;
  delete req.session.username;
  res.redirect('/login');
});

/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        linkId: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits') + 1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

module.exports = app;
