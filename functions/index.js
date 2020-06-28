const functions = require("firebase-functions");
const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const sgMail = require("@sendgrid/mail");
const cors = require("cors")({ origin: "*" });
const { google } = require("googleapis");
const path = require("path");
const AccessToken = require("twilio").jwt.AccessToken;
const VideoGrant = AccessToken.VideoGrant;

require("dotenv").config();

// Google Calendar configurations
const OAuth2 = google.auth.OAuth2;
const calendar = google.calendar("v3");

const googleCredentials = require("./calendar-credentials.json");

const ERROR_RESPONSE = {
  status: "500",
  message: "There was an error adding an event to your Google calendar",
};
const TIME_ZONE = "EST";

// SendGrid configurations
sgMail.setApiKey(functions.config().sendgrid.api_key);

// initialize the Firebase admin ccount
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
    html:
      "<div>  Welcome to Treetop Learning, <br> <br> To confirm your account for our weekly newsletter please follow this link: <a href='https://cdn.forms-content.sg-form.com/f99cddf4-b193-11ea-a875-5aa83703c24e'> verify email </a>.<br><br> All the best, <br> <br> The Treetop Learning Team </div>",
  };

  sgMail
    .send(msg)
    .then((message) => console.log("Success!"))
    .catch((error) => console.log("Error!", error));
});

// send back the secrets needed to initialize the calendar
app.get("/schedulesetup", (req, res) => {
  console.log(functions.config().fullcalendar.api_key);
  res.send({
    api_key: functions.config().fullcalendar.api_key,
    calendar_id: functions.config().fullcalendar.calendar_id,
  });
});

app.post("/schedulemeeting", (req, res) => {

  // extract all info from request
  const email = req.body.email;
  const date = req.body.date;
  const time = req.body.time;
  const uid = req.body.uid;
  const firstName = req.body.firstName;
  const lastName = req.body.lastName;

  // build times from req information in correct format
  const startTime = date + "T" + time + ":00"
  const endTime = date + "T" + "14:30" + ":00"

  const eventData = {
    eventName: "Treetop Learning Lesson",
    description: "Weekly lesson with instructor.",
    startTime: startTime,
    endTime: endTime,
  };

  // create OAuth2Client object with fresh token to be able to write to calendar
  const oAuth2Client = new OAuth2(
    googleCredentials.web.client_id,
    googleCredentials.web.client_secret,
    googleCredentials.web.redirect_uris[0]
  );

  oAuth2Client.setCredentials({
    refresh_token: googleCredentials.refresh_token,
  });

  // add the constructed event to the inputted user
  addEvent(eventData, oAuth2Client)
    .then((data) => {
      res.status(200).send(data);
      return;
    })
    .catch((err) => {
      console.error("Error adding event: " + err.message);
      res.status(500).send(ERROR_RESPONSE);
      return;
    });
});

// add event to calendar
const addEvent = (event, auth) => {
  return new Promise(function(resolve, reject) {
      calendar.events.insert({
          auth: auth,
          calendarId: 'primary',
          resource: {
              'summary': event.eventName,
              'description': event.description,
              'start': {
                  'dateTime': event.startTime,
                  'timeZone': TIME_ZONE,
              },
              'end': {
                  'dateTime': event.endTime,
                  'timeZone': TIME_ZONE,
              },
          },
      }, (err, res) => {
          if (err) {
              console.log('Rejecting because of error');
              reject(err);
          }
          console.log('Request successful');
          resolve(res.data);
      });
  })
}

// Twilio Video
app.post("/token", (req, res) => {
  const identity = req.body.identity;
  const roomName = req.body.room;

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
