var formidable = require('formidable');
var File = require('../app/models/file');
const fs = require('fs')
var LRU = require("lru-cache")
const tmpDir = '/tmp/sia3'
const lruOptions = {
    max: 1024 * 1024 * 1024 * 50, //should be 50Gb /shruggie
    length: function (hash, file) { return file.size },
    dispose: function (hash, file) { fs.unlink(tmpDir + "/" + hash) },
    maxAge: 1000 * 60 * 60,
    stale: true
}
const fileCache = LRU(lruOptions);

fs.readdir(tmpDir, (err, files) => {
    files.forEach(file => {
        console.log(file)
        File.findOne({ 'hash': file }, (err, dbFile) => {
            if (err) {
                console.log("error scanning files", err)
            } else {
                fileCache.set(dbFile.hash, dbFile)
            }
        });
    });
})

var syncing = true;
module.exports = function (app, passport, siad) {


    // show the home page (will also have our login links)
    app.get('/', function (req, res) {
        res.render('pages/index.ejs');
    });

    app.get('/_ah', function (req, res) {
        siad.get('/consensus').then((response) => {
            if (response.data.synced) {
                console.log("Consensus found");
                res.end();
            } else {
                res.writeHead(500, 'Consensus not set');
                res.write('Unknown error occurred retrieving file');
                res.end();
            }
        }).catch((err) => {
            res.writeHead(503, 'Unknown');
            res.write('Unknown error occurred retrieving file');
            res.end();
        });
    });

    // PROFILE SECTION =========================
    app.get('/profile', isLoggedIn, function (req, res) {
        siad.get('/consensus').then((response) => {
            var consensusResponse = response
            siad.get('/renter/contracts').then((contractsResponse) => {
                if (contractsResponse.data.contracts && contractsResponse.data.contracts.length > 20) {
                    syncing = false;
                    File.find({ 'owner': req.user.id }, function (err, files) {
                        if (err) {
                            console.log('An error has occured retrieving consensus: \n' + err);
                        }
                        files.forEach((file) => file.uploadComplete = (fileCache.get(file.hash) || file.isAvailable(siad)));
                        res.render('pages/profile.ejs', {
                            user: req.user,
                            consensus: consensusResponse.data,
                            objects: files,
                            syncing: syncing && response.data.synced
                        });
                    });
                } else {
                    console.log('Renter does not have enough contracts to start Sia3');
                    res.render('pages/profile.ejs', {
                        user: req.user,
                        consensus: false,
                        syncing: true
                    });
                }
            }).catch((error) => {
                console.log(error)
                res.render('pages/profile.ejs', {
                    user: req.user,
                    consensus: false,
                    syncing: true
                });
            })

        }).catch((error) => {
            console.log(error)
            syncing = true
            res.render('pages/profile.ejs', {
                user: req.user,
                consensus: false,
                syncing: syncing
            });
        })
    });

    app.post('/objects', isLoggedIn, function (req, res) {
        // create an incoming form object
        var form = new formidable.IncomingForm();

        // specify that we want to allow the user to upload multiple files in a single request
        form.multiples = true;

        // store all uploads in the /uploads directory
        form.uploadDir = tmpDir

        form.hash = 'md5'

        // every time a file has been uploaded successfully,
        // rename it to it's orignal name
        form.on('file', function (field, file) {
            console.log('Got a file: ' + file.name + ". Hash: " + file.hash);
            var newFile = new File();
            newFile.hash = file.hash;
            newFile.filename = file.name;
            newFile.owner = req.user._id;
            newFile.size = file.size;
            newFile.save(function (err) {
                if (err) {
                    console.log('An error has occured saving file to db parsing form: ' + err);
                }
                return newFile;
            });
            var newFilePath = tmpDir + "/" + newFile.hash
            fs.rename(file.path, newFilePath)
            //upload file to sia
            console.log('Posting: ' + newFilePath);
            console.log("To: " + '/renter/upload/' + req.user.id + "/" + newFile.hash)
            fileCache.set(newFile.hash, newFile)
            siad.post('/renter/upload/' + req.user.id + "/" + newFile.hash + "?source=" + newFilePath).then(function () {
                console.log('Successfully added new file to SIA');
            }).catch(function (error) {
                //TODO handle duplicate files etc...
                console.log(error)
                console.log('An error has occured uploading file: \n' + error);
            })
        });

        // log any errors that occur
        form.on('error', function (err) {
            console.log('An error has occured processing file: \n' + err);
        });

        // once all the files have been uploaded, send a response to the client
        form.on('end', function () {
            res.end('success');
        });

        // parse the incoming request containing the form data
        form.parse(req)
    });

    app.get('/objects', isLoggedIn, function (req, res) {
        File.find({ 'owner': req.user.id }, function (err, files) {
            if (err) {
                console.log('An error has occured finding objects for user: \n' + err);
            }
            res.json(files.filter(function (file) {
                return file.isAvailable(siad);
            }));
        })
    });

    app.get('/objects/:hash/:filename', isLoggedIn, function (req, res) {
        File.findOne({ 'hash': req.params.hash }, function (err, file) {
            if (err) {
                console.log('An error has occured' + err);
            }

            if (file && (fileCache.get(file.hash) || file.isAvailable(siad))) {
                const filePath = tmpDir + "/" + file.hash
                console.log("Getting: " + '/renter/download/' + req.user.id + "/" + file.hash + "?destination=" + filePath)
                if (fileCache.get(file.hash)) {
                    console.log("Cache hit for hash: " + filePath)
                    var stream = fs.createReadStream(filePath);
                    stream.on('error', function () {
                        res.writeHead(503, 'Unknown');
                        res.write('Unknown error occurred retrieving file');
                        res.end();
                    });
                    res.statusCode = 200;
                    res.set({
                        'Cache-Control': 'public, max-age=31557600',
                    })
                    stream.pipe(res);
                    console.log('Successfully retrieved file from SIA');
                } else {
                    console.log("Cache miss for hash: " + filePath)
                    siad.get('/renter/download/' + req.user.id + "/" + file.hash + "?destination=" + filePath)
                        .then(() => {
                            var stream = fs.createReadStream(filePath);
                            stream.on('error', function () {
                                res.writeHead(503, 'Unknown');
                                res.write('Unknown error occurred retrieving file');
                                res.end();
                            });
                            res.statusCode = 200;
                            res.set({
                                'Cache-Control': 'public, max-age=31557600',
                            })
                            stream.pipe(res);
                            //fs.unlink(tmpDir + "/" + req.user.id + "/" + file.filename);
                            fileCache.set(file.hash, file);
                            console.log('Successfully retrieved file from SIA');
                        }).catch((err) => {
                            file.uploadComplete = false
                            file.save(function (err) {
                                if (err) {
                                    console.log('An error has occured saving file during update: ' + err);
                                }
                            })
                            console.log('An error has occured getting files:' + err);
                        })
                }
            } else if (file && !file.isAvailable(siad)) {
                res.writeHead(404, 'Not Found');
                res.write('404: File Not Ready');
                res.end();
            } else {
                res.writeHead(404, 'Not Found');
                res.write('404: File Not Found');
                res.end();
            }
        });
    });

    app.delete('/objects/:hash/:filename', isLoggedIn, function (req, res) {
        File.findOne({ 'hash': req.params.hash, 'owner': req.user.id }, function (err, file) {
            if (err) {
                console.log('An error occured getting file to delete' + err);
                res.writeHead(503, 'Unknown');
                res.end();
                return
            }

            if (file) {
                if (file.owner == req.user.id) {
                    fileCache.del(file.hash)
                    siad.post('/renter/delete/' + req.user.id + "/" + file.hash).then(() => {
                        console.log("Successfully deleted file from SIA", err)
                        File.remove({ _id: file._id }, (err) => {
                            if (err) {
                                //TODO this is really bad, if this happens we'll be paying for leftover files
                                console.log("Unable to delete file from mongo")
                            } else {
                                console.log("Successfully deleted from mongo", err)
                            }
                        });
                    }).catch((err) => {
                        console.log("Unable to delete file from sia")
                    })
                }
            } else {
                res.writeHead(404, 'Not Found');
                res.write('File Not Found');
                res.end();
            }
        });


    });

    // LOGOUT ==============================
    app.get('/logout', function (req, res) {
        req.logout();
        res.redirect('/');
    });

    // =============================================================================
    // AUTHENTICATE (FIRST LOGIN) ==================================================
    // =============================================================================

    // locally --------------------------------
    // LOGIN ===============================
    // show the login form
    app.get('/login', function (req, res) {
        res.render('pages/login.ejs', { message: req.flash('loginMessage') });
    });

    // process the login form
    app.post('/login', passport.authenticate('local-login', {
        successRedirect: '/profile', // redirect to the secure profile section
        failureRedirect: '/login', // redirect back to the signup page if there is an error
        failureFlash: true // allow flash messages
    }));

    // SIGNUP =================================
    // show the signup form
    app.get('/signup', function (req, res) {
        res.render('pages/signup.ejs', { message: req.flash('signupMessage') });
    });

    // process the signup form
    app.post('/signup', passport.authenticate('local-signup', {
        successRedirect: '/profile', // redirect to the secure profile section
        failureRedirect: '/signup', // redirect back to the signup page if there is an error
        failureFlash: true // allow flash messages
    }));

    // facebook -------------------------------

    //     // send to facebook to do the authentication
    //     app.get('/auth/facebook', passport.authenticate('facebook', { scope : 'email' }));

    //     // handle the callback after facebook has authenticated the user
    //     app.get('/auth/facebook/callback',
    //         passport.authenticate('facebook', {
    //             successRedirect : '/profile',
    //             failureRedirect : '/'
    //         }));

    // // twitter --------------------------------

    //     // send to twitter to do the authentication
    //     app.get('/auth/twitter', passport.authenticate('twitter', { scope : 'email' }));

    //     // handle the callback after twitter has authenticated the user
    //     app.get('/auth/twitter/callback',
    //         passport.authenticate('twitter', {
    //             successRedirect : '/profile',
    //             failureRedirect : '/'
    //         }));


    // google ---------------------------------

    // send to google to do the authentication
    app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

    // the callback after google has authenticated the user
    app.get('/auth/google/oauthcallback',
        passport.authenticate('google', {
            successRedirect: '/profile',
            failureRedirect: '/'
        }));

    // =============================================================================
    // AUTHORIZE (ALREADY LOGGED IN / CONNECTING OTHER SOCIAL ACCOUNT) =============
    // =============================================================================

    // locally --------------------------------
    app.get('/connect/local', function (req, res) {
        res.render('pages/connect-local.ejs', { message: req.flash('loginMessage') });
    });
    app.post('/connect/local', passport.authenticate('local-signup', {
        successRedirect: '/profile', // redirect to the secure profile section
        failureRedirect: '/connect/local', // redirect back to the signup page if there is an error
        failureFlash: true // allow flash messages
    }));

    // facebook -------------------------------

    //     // send to facebook to do the authentication
    //     app.get('/connect/facebook', passport.authorize('facebook', { scope : 'email' }));

    //     // handle the callback after facebook has authorized the user
    //     app.get('/connect/facebook/callback',
    //         passport.authorize('facebook', {
    //             successRedirect : '/profile',
    //             failureRedirect : '/'
    //         }));

    // // twitter --------------------------------

    //     // send to twitter to do the authentication
    //     app.get('/connect/twitter', passport.authorize('twitter', { scope : 'email' }));

    //     // handle the callback after twitter has authorized the user
    //     app.get('/connect/twitter/callback',
    //         passport.authorize('twitter', {
    //             successRedirect : '/profile',
    //             failureRedirect : '/'
    //         }));


    // google ---------------------------------

    // send to google to do the authentication
    app.get('/connect/google', passport.authorize('google', { scope: ['profile', 'email'] }));

    // the callback after google has authorized the user
    app.get('/connect/google/callback',
        passport.authorize('google', {
            successRedirect: '/profile',
            failureRedirect: '/'
        }));

    // local -----------------------------------
    app.get('/unlink/local', isLoggedIn, function (req, res) {
        var user = req.user;
        user.local.email = undefined;
        user.local.password = undefined;
        user.save(function () {
            res.redirect('/profile');
        });
    });

    // // facebook -------------------------------
    // app.get('/unlink/facebook', isLoggedIn, function(req, res) {
    //     var user            = req.user;
    //     user.facebook.token = undefined;
    //     user.save(function(err) {
    //         res.redirect('/profile');
    //     });
    // });

    // // twitter --------------------------------
    // app.get('/unlink/twitter', isLoggedIn, function(req, res) {
    //     var user           = req.user;
    //     user.twitter.token = undefined;
    //     user.save(function(err) {
    //         res.redirect('/profile');
    //     });
    // });

    // google ---------------------------------
    app.get('/unlink/google', isLoggedIn, function (req, res) {
        var user = req.user;
        user.google.token = undefined;
        user.save(function () {
            res.redirect('/profile');
        });
    });


};

// route middleware to ensure user is logged in
function isLoggedIn(req, res, next) {
    if (req.isAuthenticated())
        return next();

    res.redirect('/');
}