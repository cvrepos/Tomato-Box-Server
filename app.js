// API_KEY is key obtained from rottentomatoes.com
var API_KEY = process.env.API_KEY;

if(API_KEY == null){
    console.log("API_KEY is null. Please export API_KEY to correct value following install instructions.");
    process.exit(1);
}

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
    app.use(express.bodyParser());
    app.use(app.router);
    app.use(express.logger());
});

app.configure('production', function(){
    var env = JSON.parse(process.env.VCAP_SERVICES);
    mongo = env['mongodb-1.8'][0]['credentials'];
    app.use(passport.initialize());
    app.use(express.bodyParser());
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
    response.setHeader("Content-Length", data.length);
    response.setHeader("Content-Type", "text/json");
    response.writeHead(200);
    response.write(data);
    response.end();
    return data;
}

function findRanking(movie, bUpdate, response)
{
    try{
      connection.collection("movies", function(err, coll){
        if(err){
           console.log("Error obtaining movies collection.");
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

function updateRankings(rankings, ranking, index, response, force)
{
    if(ranking == null){
        ranking = new Object();
        ranking.critics_score = "none";
        ranking.audience_score = "none";
        ranking._id = "";
    }
    var wrapper = rankings[index];
    wrapper.critics_score = ranking.critics_score;
    wrapper.audience_score = ranking.audience_score;
    wrapper._id = ranking._id;
    wrapper.rlink = ranking.rlink;

    if(rankings.length != total && force != true){
        return;
    }

    var data;
    if(rankings.length == total || force == true){
        data = JSON.stringify(rankings);
    }
    fs.writeFile('titles.json.txt', data, function (err) {
            if (err){
            console.log("Error saving rankings file");
            }
            console.log('file  saved!');
    });
    //console.log("Sending data:"+ data);
    data = "Ranking is being written to titles.json.txt";
    response.writeHead(200, {'Content-Length': data.length, 'Content-Type': 'text/json'});
    response.write(data);
    response.end();
}
function collectRankings(rankings, ranking, total, movie, response, force)
{
    if(ranking == null){
        ranking = new Object();
        ranking.critics_score = "none";
        ranking.audience_score = "none";
        ranking._id = "";
    }
    var wrapper = new Object();
    wrapper.critics_score = ranking.critics_score;
    wrapper.audience_score = ranking.audience_score;
    wrapper._id = ranking._id;
    wrapper.rlink = ranking.rlink;
    wrapper.context = movie.context;

    rankings.push(wrapper);
    
    if(rankings.length != total && force != true){
        return;
    }

    var data;
    if(rankings.length == total || force == true){
        data = JSON.stringify(rankings);
    }
    //console.log("Sending data:"+ data);
    response.writeHead(200, {'Content-Length': data.length, 'Content-Type': 'text/json'});
    response.write(data);
    response.end();
}

function addContext(ranking, movie)
{
    ranking.context = movie.context;
}

function findRanking_n(movies, bUpdate, response)
{
  var rankings = new Array();
  for(var i = 0; i <movies.length ; i++)
  {
   // induce scope by anonymous function 
   (function(){
    var movie = movies[i];
    //console.log("["+ i+ "]Movie is :" + movie.name);
    var ranking;
    if((ranking = cache[movie.name])){
        //console.log("Ranking " + JSON.stringify(ranking) + " in the cache.");
        collectRankings(rankings, ranking, movies.length, movie, response);
        return;
    }

    // movie not found in cache
    try{
         connection.collection("movies", function(err, coll){
         if(err){
           //console.log("Error obtaining movies collection.");
           collectRankings(rankings, null, movies.length, movie, response,  true);
           return;
         }

         coll.findOne({_id:movie.name}, function(err, content){
            if(content && bUpdate == false){
                //var data = respond(content, response, movie, true);
                cache[content._id] = content;
                collectRankings(rankings, content, movies.length, movie, response);
                //console.log("Found Movie in DB.:" + content._id +" data:" + content);
            }else{
            //else query rotten tomatoes directly
            getRankings(movie.name, function(id, ratings, rlink){
                    var info = new Ranking();
                    if(ratings){
                        //console.log("critics ranking is:" + ratings.critics_score + ". audience ranking is:" + ratings.audience_score);
                    }
                    info.critics_score = ratings ? ratings.critics_score : 0;
                    info.audience_score = ratings ? ratings.audience_score : 0;
                    info._id = movie.name;
                    info.rlink = rlink;
                    (function(){
                        var scopedInfo = info;
                        var scopedMovie = movie;
                        try{
                            cache[scopedMovie.name] = scopedInfo;
                            coll.save( scopedInfo, {safe:true}, function(err){
                            //var jsonContent = respond(info, response, movie, true);
                            //console.log("successfully inserted:" + scopedInfo);
                            collectRankings(rankings, scopedInfo, movies.length, movie, response);
                            });
                        }catch(err){
                            console.log("Exception caught inserting:" + err);
                        }
                    })();
                });
            }
        });
      });
    }catch(err){
        console.log("Exception processing collection:" + err);
        collectRankings(rankings, null, movies.length, movie, response);
    }
    //end - anonymous function
   })();
  }
  
}

function updateRanking_n(movies, response)
{
  var bUpdate = false;
  for(var i = 0; i <movies.length ; i++)
  {
   // induce scope by anonymous function 
   (function(){
    var movie = movies[i];
    var index = i;
    console.log("["+ i+ "]Movie is :" + movie.name);
    var ranking;
    if((ranking = cache[movie.name])){
        console.log("Ranking " + JSON.stringify(ranking) + " in the cache.");
        updateRankings(movies, ranking, index, response);
        return;
    }

    // movie not found in cache
    try{
         connection.collection("movies", function(err, coll){
         if(err){
           console.log("Error obtaining movies collection.");
           updateRankings(movies, null, index, response);
           return;
         }

         coll.findOne({_id:movie.name}, function(err, content){
            if(content && bUpdate == false){
                //var data = respond(content, response, movie, true);
                cache[content._id] = content;
                updateRankings(movies, content, index, response);
                console.log("Found Movie in DB.:" + content._id +" data:" + content);
            }else{
            //else query rotten tomatoes directly
            getRankings(movie.name, function(id, ratings, rlink){
                    var info = new Ranking();
                    if(ratings){
                        console.log("critics ranking is:" + ratings.critics_score + ". audience ranking is:" + ratings.audience_score);
                    }
                    info.critics_score = ratings ? ratings.critics_score : 0;
                    info.audience_score = ratings ? ratings.audience_score : 0;
                    info._id = movie.name;
                    info.rlink = rlink;
                    (function(){
                        var scopedInfo = info;
                        var scopedMovie = movie;
                        var index = index;
                        try{
                            cache[scopedMovie.name] = scopedInfo;
                            coll.save( scopedInfo, {safe:true}, function(err){
                            //var jsonContent = respond(info, response, movie, true);
                            //console.log("successfully inserted:" + scopedInfo);
                            updateRankings(movies, scopedInfo, index, response);
                            });
                        }catch(err){
                            console.log("Exception caught inserting:" + err);
                        }
                    })();
                });
            }
        });
      });
    }catch(err){
        console.log("Exception processing collection:" + err);
        updateRankings(movies, null, index, response);
    }
    //end - anonymous function
   })();
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

function Movie(name, context)
{
    this.name = name;
    this.context = context; 
}
function Ranking()
{
    this.critics_score = 0;
    this.audience_score = 0;
    this._id = null;
    this.rlink = null;
}

function normalize_n(movies)
{
    var amovies = new Array();
    for(var i=0; i<movies.length; i++){
        var name = movies[i].name;
        var decoded  = decodeURIComponent(name);
        var replaced = decoded.replace(/\(.*\)/,"");
        var trimmed = replaced.trim().toUpperCase();
        var movie = new Movie(trimmed, movies[i].context);
        amovies.push(movie);
    }
    return amovies;
}

var mongourl = generate_mongo_url(mongo);
var connection;
require('mongodb').connect(mongourl, function(err, conn){
     if(err){
          console.log("Error connecting to mongodb:" + err); 
     }else{
          connection = conn;
     }
}); 

function httpReqHandler(request, response)
{
  //console.log(request.url);
  var result = require('url').parse(request.url, true);
  //console.log(JSON.stringify(result));
  //console.log(JSON.stringify(request.body));
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
  } else if(request.body && request.body.ids){
      var movies = normalize_n(request.body.ids);
      findRanking_n(movies, false, response);
  }
  else{
      response.writeHead(500, {'Content-Type': 'text/html'});
      response.write("invalid url");
      response.end();
  }
}

function updateHandler(request, response)
{
  console.log("invoked update");
  if(request.body && request.body.rankings){
      var rankings = request.body.rankings;
      console.log(JSON.stringify(rankings));
      for(var i=0; i<rankings.length; i++){
          var ranking = rankings[i];
          cache[ranking._id] = ranking;
          
          try{
              (function(){
                 var scopedInfo = ranking;
                 var index = i;
                 connection.collection("movies", function(err, coll){
                    if(err){
                      console.log("Error obtaining movies collection.");
                      response.writeHead(500, {'Content-Type': 'text/html'});
                      response.write("invalid url");
                      response.end();
                      return;
                    }
                    coll.save( scopedInfo, {safe:true}, function(err){
                        console.log("successfully inserted:" + JSON.stringify(scopedInfo));
                        if((index + 1) ==  rankings.length){
                              response.writeHead(200, {'Content-Type': 'text/html'});
                              response.write("done updating");
                              response.end();
                        }
                    });
                 });
              })();
          }//end try
          catch(err)
          {
              console.log("Error updateHandler");
              response.writeHead(500, {'Content-Type': 'text/html'});
              response.write("invalid url");
              response.end();
          }
      }
  }
  else{
      response.writeHead(500, {'Content-Type': 'text/html'});
      response.write("invalid url");
      response.end();
  }
}

function pullRedboxTitles(request, response)
{
  console.log(request.url);
  var result = require('url').parse(request.url, true);
  if(result && result.query && result.query.d){
      // pull request from redbox.com 
      //check if the file exists for the date - 
      //fs.exist

      getRedboxTitles(updateRedboxRankings, response);
      
  }
  else{
      response.writeHead(500, {'Content-Type': 'text/html'});
      response.write("invalid url");
      response.end();
  }
}

function updateRedboxRankings(titles, response)
{
    console.log("updating ranking for[%d] titles", titles.length);
    updateRanking_n(titles,response);

}

function getRedboxTitles(callback, response) 
{
    var request = require('request');
    request('http://www.redbox.com/api/product/js/__titles', function (error, response, body) {
            if (!error && response.statusCode == 200) {
                var movieObjects = JSON.parse(body);
                if(movieObjects.movies == null || movieObjects.movies.length == 0){
                    callback(null, response);
                    return;
                }
                callback(movieObjects, response);
            }else{
                callback(null, response);
            }
    });
}

var cache = new Array();

// Start - backward compatible interface
app.get("/add", 
  passport.authenticate('bearer', { session: false }),
  httpReqHandler);
// End

// XXX- new interfaces
app.get("/get", 
  passport.authenticate('bearer', { session: false }),
  httpReqHandler);

app.post("/get", 
  passport.authenticate('bearer', { session: false }),
  httpReqHandler);

// XXX- will be called by a script evry night to pull movie information from redbox.com
//app.get("/query", 
//  passport.authenticate('bearer', { session: false }),
//  pullRedboxTitles);

app.post("/update",
  passport.authenticate('bearer', { session: false }),
  updateHandler);

app.listen(process.env.VCAP_APP_PORT || 8989);
console.log('Server started');
