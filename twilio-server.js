const express = require("express");
const app = express();
const https = require("https");
const cors = require("cors");
const fs = require("fs");
const port = 8080;
const path = require("path");
const AccessToken = require("twilio").jwt.AccessToken;
const VideoGrant = AccessToken.VideoGrant;

const MAX_ALLOWED_SESSION_DURATION = 14400;
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioApiKeySID = process.env.TWILIO_API_KEY_SID;
const twilioApiKeySecret = process.env.TWILIO_API_KEY_SECRET;

require("dotenv").config();

var key = fs.readFileSync('certs/selfsigned.key');
var cert = fs.readFileSync('certs/selfsigned.crt');
var options = {
  key: key,
  cert: cert
};

app.use(express.static(path.join(__dirname, "build")));
app.use(cors());

app.post("/token", cors({ origin: ["http://10.0.1.26:8000"] }), (req, res) => {
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

var server = https.createServer(options, app);

server.listen(port, () => {
  console.log("server starting on port: " + port)
});

// app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'build/index.html')));

app.get('/', function (req, res) {
  res.writeHead(200);
  res.end("hello world\n");
});
