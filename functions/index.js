const functions = require("firebase-functions");
const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const sgMail = require("@sendgrid/mail");
const cors = require("cors")({ origin: "*" });
const path = require("path");
const AccessToken = require("twilio").jwt.AccessToken;
const VideoGrant = AccessToken.VideoGrant;

require("dotenv").config();

 // SendGrid configurations
sgMail.setApiKey(functions.config().sendgrid.api_key);

// initialize the firebase admina ccount
let admin = require("firebase-admin");

admin.initializeApp();

app.use(express.static(path.join(__dirname, "build")));
app.use("*", cors);
app.use(bodyParser.json());

app.post("/sendemail", (req, res) => {
  const msg = {
    to: req.body.email.recipient,
    from: functions.config().sendgrid.sender,
    subject: "Treetop Newsletter - Email Address Verification",
    html: "<div>  Welcome to Treetop Learning, <br> <br> To confirm your account for our weekly newsletter please follow this link: <a href='https://cdn.forms-content.sg-form.com/f99cddf4-b193-11ea-a875-5aa83703c24e'> verify email </a>.<br><br> All the best, <br> <br> The Treetop Learning Team </div>",
  };

  sgMail
    .send(msg)
    .then((message) => console.log("Success!"))
    .catch((error) => console.log("Error!", error));

});

// send back the secrets needed to initialize the calendar
app.get("/schedulesetup", (req, res) => {
  console.log(functions.config().fullcalendar.api_key)
  res.send({api_key: functions.config().fullcalendar.api_key, calendar_id: functions.config().fullcalendar.calendar_id})
});

// Twilio Video
app.post("/token", (req, res) => {

  const identity = req.body.identity
  const roomName = req.body.room

  const token = new AccessToken(
    functions.config().twilio.account_sid,
    functions.config().twilio.api_key_sid,
    functions.config().twilio.api_key_secret,
    {
      ttl: 14400,
    }
  );

  token.identity = identity;

  const videoGrant = new VideoGrant({ room: roomName });
  token.addGrant(videoGrant);
  res.send(token.toJwt());
});

// firebase verification

app.post("/verify", (req, res) => {
  admin
    .auth()
    .verifyIdToken(req.body.idt)
    .then((decodedToken) => {
      let uid = decodedToken.uid;
      console.log(uid);
      res.send(JSON.stringify({ uid: uid }));
    })
    .catch((error) => {
      console.log("there was an error in verify", error);
    });
});

app.get("/testing", (request, response) => {
  response.send("Congrats.");
});

app.use(cors);

exports.app = functions.https.onRequest(app);
