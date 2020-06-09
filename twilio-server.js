
const express = require("express");
const app = express();
const https = require("https");
const bodyParser = require('body-parser')
const cors = require("cors");
const fs = require("fs");
const port = 8080;
const path = require("path");
const AccessToken = require("twilio").jwt.AccessToken;
const VideoGrant = AccessToken.VideoGrant;

require("dotenv").config();

// initialize the firebase admina ccount
var admin = require("firebase-admin");

var serviceAccount = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://treetop-learning-1589657684780.firebaseio.com"
});

var key = fs.readFileSync('certs/selfsigned.key');
var cert = fs.readFileSync('certs/selfsigned.crt');
var options = {
  key: key,
  cert: cert
};

app.use(express.static(path.join(__dirname, "build")));
app.use(cors());

app.use(bodyParser.json())

// twilio video
app.post("/token", cors({ origin: ["https://10.0.1.26:8000"] }), (req, res) => {

  const identity = String(Math.random());
  const roomName = "Treetop-Testing"; //req.query;
  const token = new AccessToken(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_API_KEY_SID,
    process.env.TWILIO_API_KEY_SECRET,
    {
      ttl: 14400,
    }
  );
  token.identity = identity;

  const videoGrant = new VideoGrant({ room: roomName });
  token.addGrant(videoGrant);
  res.send(token.toJwt());
  console.log(`issued token for ${identity} in room ${roomName}`);
});

app.post("/token", cors({ origin: ["https://10.0.1.26:8000"] }), (req, res) => {

  res.send(token.toJwt());
  console.log(`issued token for ${identity} in room ${roomName}`);
});

// firebase verificatoin
app.post("/verify", cors({ origin: ["https://10.0.1.26:8000"] }), (req, res) => {
  console.log(req.body.idt);
  admin.auth().verifyIdToken(req.body.idt)
  .then(function(decodedToken) {
    let uid = decodedToken.uid;
    console.log(uid);
    res.send(JSON.stringify({'uid': uid}));
    // res.send({"uid": String(uid)})
    // ...
  }).catch(function(error) {
    // Handle error
  
  });
});

// initialize server
var server = https.createServer(options, app);

server.listen(port, () => {
  console.log("server starting on port: " + port)
});

// app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'build/index.html')));

app.get('/', function (req, res) {
  res.writeHead(200);
  res.end("hello world\n");
});
