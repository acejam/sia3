// load the things we need
var mongoose = require('mongoose');
var config = require('../../config');
var redis = require('redis')
var client = redis.createClient(config.redis_url, {
    retry_strategy: function (options) {
        if (options.error && options.error.code === 'ECONNREFUSED') {
            // End reconnecting on a specific error and flush all commands with a individual error
            return new Error('The server refused the connection');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
            // End reconnecting after a specific timeout and flush all commands with a individual error
            return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
            // End reconnecting with built in error
            return undefined;
        }
        // reconnect after
        return Math.min(options.attempt * 100, 3000);
    }
});

var fileSchema = mongoose.Schema({
    hash: { type: String, required: true },
    filename: String,
    owner: String,
    createdDate: { type: Date, default: Date.now },
    size: Number,
    uploadComplete: { type: Boolean, default: false },
});

fileSchema.methods.toJSON = function () {
    var obj = this.toObject()
    var returnJson = {
        filename: obj.filename,
        owner: obj.owner,
        createdDate: obj.createdDate,
        size: obj.size,
        url: "/" + obj.hash + "/" + obj.filename,
        uploadComplete: obj.uploadComplete
    }
    return returnJson
}

fileSchema.methods.isAvailable = function (siad) {
    if (this.uploadComplete) return true
    client.get("FILES", (err, reply) => {
        if (err) {
            console.log("Error getting from cache: " + err);
        }
        if (reply) {
            JSON.parse(reply).files.forEach((file) => {
                if (file.siapath === this.owner + "/" + this.hash) {
                    this.uploadComplete = file.available;
                    this.save(function (err) {
                        if (err) {
                            console.log('An error has occured saving file. ' + err);
                        }
                    })
                }
            });
        } else {
            siad.get('/renter/files').then((response) => {
                client.set("FILES", JSON.stringify(response.data), 'EX', 10);
                response.data.files.forEach((file) => {
                    if (file.siapath === this.owner + "/" + this.hash) {
                        this.uploadComplete = file.available;
                        this.save(function (err) {
                            if (err) {
                                console.log('An error has occured saving file. ' + err);
                            }
                        })
                    }
                });
            }).catch((err) => {
                console.log('An error has occured getting files for file: ' + this.filename + ". Error: " + err);
            })
        }
    })
    
}

module.exports = mongoose.model('File', fileSchema)