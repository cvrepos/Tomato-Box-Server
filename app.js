//change API_KEY to your auth key obtained from rottentomatoes.com
var API_KEY = "qzev8s925mvwmvpp75rubuk4";

var sys = require('util')
  , http = require('http')
  , passport = require('passport')
  , BearerStrategy = require('passport-http-bearer').Strategy;

////// - copied straight from passport-http-bearer example 
var users = [
    { id: 1, username: 'plugin', token: 'B8CF722F917D', email: 'a@example.com' }
];

function findByToken(token, fn) {
  for (var i = 0, len = users.length; i < len; i++) {
    var user = users[i];
    if (user.token === token) {
      return fn(null, user);
    }
  }
  return fn(null, null);
}


// Use the BearerStrategy within Passport.
//   Strategies in Passport require a `validate` function, which accept
//   credentials (in this case, a token), and invoke a callback with a user
//   object.
passport.use(new BearerStrategy({
  },
  function(token, done) {
    // asynchronous validation, for effect...
    process.nextTick(function () {
      
      // Find the user by token.  If there is no user with the given token, set
      // the user to `false` to indicate failure.  Otherwise, return the
      // authenticated `user`.  Note that in a production-ready application, one
      // would want to validate the token for authenticity.
      findByToken(token, function(err, user) {
        if (err) { return done(err); }
        if (!user) { return done(null, false); }
        return done(null, user);
      })
    });
  }
));

/////////

var express = require('express');
var app = express();

var mongo;
app.configure('development', function(){
    mongo = {
        "hostname":"localhost",
        "port":27017,
        "username":"",
        "password":"",
        "name":"",
        "db":"db"
    };
    app.use(passport.initialize());
    app.use(app.router);
    app.use(express.logger());
});

app.configure('production', function(){
    var env = JSON.parse(process.env.VCAP_SERVICES);
    mongo = env['mongodb-1.8'][0]['credentials'];
    app.use(passport.initialize());
    app.use(app.router);
});

var generate_mongo_url = function(obj){
    obj.hostname = (obj.hostname || 'localhost');
    obj.port = (obj.port || 27017);
    obj.db = (obj.db || 'test');
    if(obj.username && obj.password){
        return "mongodb://" + obj.username + ":" + obj.password + "@" + obj.hostname + ":" + obj.port + "/" + obj.db;
    }else{
        return "mongodb://" + obj.hostname + ":" + obj.port + "/" + obj.db;
    }
}

function respond(content, response, movie, stringify)
{
    var data;
    if(content == null){
        content = new Object();
        content.critics_score = "none";
        content.audience_score = "none";
        content.id = "";
    }
    if(stringify == false){
        data = content;
    }else{
        data = JSON.stringify(content);
    }
    //console.log("Sending data:"+ data);
    response.writeHead(200, {'Content-Length': data.length, 'Content-Type': 'text/json'});
    response.write(data);
    response.end();
    return data;
}

function findRanking(movie, bUpdate, response)
{
    try{
      connection.collection("movies", function(err, coll){
        if(err){
           //console.log("Error obtaining movies collection.");
           respond(null, response, movie, true);
           return;
        }

        coll.findOne({_id:movie}, function(err, content){
            if(content && bUpdate == false){
                var data = respond(content, response, movie, true);
                //console.log("Found Movie:" +movie +" data:" + data);
            }else{
            //else query rotten tomatoes directly
            getRankings(movie, function(id, ratings, rlink){
                    var info = new Object();
                    if(ratings){
                        //console.log("critics ranking is:" + ratings.critics_score + ". audience ranking is:" + ratings.audience_score);
                    }
                    info.critics_score = ratings ? ratings.critics_score : 0;
                    info.audience_score = ratings ? ratings.audience_score : 0;
                    info._id = movie;
                    info.rlink = rlink;
                    try{
                        coll.save( info, {safe:true}, function(err){
                        var jsonContent = respond(info, response, movie, true);
                        //console.log("successfully inserted:" + jsonContent);
                        });
                    }catch(err){
                        console.log("Exception caught inserting:" + err);
                    }
                });
            }
        });
      });
    }catch(err){
        console.log("Exception processing collection:" + err);
        respond(null, response, movie, true);
    }
}

function getRankings(movie, callback) {
    //console.log("movie is :" + movie);
    var urlPath = "/api/public/v1.0/movies.json?q=" + encodeURIComponent(movie) + "&page_limit=5&page=1&apikey=" + API_KEY;
    var options = {
      host: 'api.rottentomatoes.com',
      port: 80,
      path: urlPath,
      method: 'GET'
    };
    var msgBody = "";
    var req = http.request(options, function(res) {
            //console.log('STATUS: ' + res.statusCode);
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                msgBody += chunk;
            });
            res.on('end', function(){
                if(msgBody!= "" && res.statusCode == 200){
                    var movieObject = JSON.parse(msgBody);
                    if(movieObject.movies == null || movieObject.movies.length == 0){
                       callback(null, null, null);
                       return;
                    }
                    if(movieObject.movies.length == 1){
                      // only a single movie - lets assume that this is THE movie we are looking for 
                      var item = movieObject.movies[0];
                      var rlink = item.links.alternate;
                      callback(item.id, item.ratings, rlink);
                      return;
                    }
                    // asuming the first movie in the result is the movie I am looking for
                    // tallying the results, year of release  will yeild more accurate information
                    for(var i = 0; i<movieObject.movies.length; i++){
                        var item = movieObject.movies[i];
                        if(movie == item.title.toUpperCase()){
                           var id = item.id;
                           //console.log("Id of the movie is:" + id);
                           var rlink = item.links.alternate;
                           callback(id, item.ratings, rlink);
                           return;
                        }else{
                          //console.log("title=[" + movie + "] and movie=[" + item.title + "] does not match.");
                        }
                    }
                    callback(null, null, null);
                }else{
                    callback(null, null, null);
                }
            });
    });

    req.on('error', function(e) {
            console.log('problem with request: ' + e.message);
    });

    req.end();
}

function normalize(name)
{
    var decoded  = decodeURIComponent(name);
    var replaced = decoded.replace(/\(.*\)/,"");
    var trimmed = replaced.trim().toUpperCase();
    return trimmed;
}

var mongourl = generate_mongo_url(mongo);
var connection;
require('mongodb').connect(mongourl, function(err, conn){
     if(err){
          console.log("Error connecting to mongodb:" + err); 
     }else{
          connection = conn;
          console.log("Connected to mongodb:" + connection); 
     }
}); 


app.get("/add", 
  passport.authenticate('bearer', { session: false }),
  function (request, response) {
  //console.log(request.url);
  var result = require('url').parse(request.url, true);
  //console.log(JSON.stringify(result));
  var bUpdate = false;
  if(result && result.query && result.query.update){
     if(result.query.update == 1){
        console.log("Update is requested");
        bUpdate = true;
     }
  }
  if(result && result.query && result.query.id){
      //console.log(result.query.id);
      var nMovie = normalize(result.query.id);
      findRanking(nMovie, bUpdate, response);
  }
  else{
      response.writeHead(402, {'Content-Type': 'text/html'});
      response.write("invalid url");
      response.end();
  }
});

app.listen(process.env.VCAP_APP_PORT || 8989);
console.log('Server started /add');