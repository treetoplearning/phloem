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

// initialize the Firebase admin ccount
let admin = require("firebase-admin");

// Google Calendar configurations
const googleCredentials = require("./calendar-credentials.json");

const OAuth2 = google.auth.OAuth2;
const calendar = google.calendar("v3");

// create OAuth2Client object with fresh token to be able to write to calendar
const OAuth2Client = new OAuth2(
  googleCredentials.web.client_id,
  googleCredentials.web.client_secret,
  googleCredentials.web.redirect_uris[0]
);

// set the refresh token in the OAuth to avoid constantly generating new access tokens
OAuth2Client.setCredentials({
  refresh_token: googleCredentials.refresh_token,
});

const ERROR_RESPONSE = {
  status: "500",
  message: "There was an error adding an event to your Google calendar",
};

const TIME_ZONE = "America/Los_Angeles";

// SendGrid configurations
sgMail.setApiKey(functions.config().sendgrid.api_key);

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

// book the input lesson for the user and send back
app.post("/bookLesson", async (req, res) => {
  const fullName = req.body.firstName + " " + req.body.lastName;
  const email = req.body.email;
  const targetLessonId = req.body.lessonId;
  const uid = req.body.uid;

  // array to hold all events to be sent back (after events have been edited )
  let finalEvents = [];

  // get all the events in the calendar
  const events = await calendar.events
    .list({
      auth: OAuth2Client,
      calendarId: "primary",
      maxResults: 100000,
      singleEvents: true,
      orderBy: "startTime",
    })
    .then((res) => {
      return res.data.items;
    });

  // loop through the events and search for the event to be booked
  for (let x = 0; x < events.length; x++) {
    if (events[x].id === targetLessonId && events[x].description == null) {
      // extract that event so edits can be made to it
      let targetLesson = events[x];

      if (typeof targetLesson.attendees === "undefined") {
        targetLesson.attendees = [];
      }

      targetLesson.attendees.push({
        email: email,
        displayname: fullName,
        responseStatus: "needsAction",
      });

      // update description to reflect booking
      targetLesson.description = uid;

      // save updates to the calendar
      calendar.events
        .patch({
          auth: OAuth2Client,
          calendarId: "primary",
          eventId: targetLessonId,
          resource: targetLesson,
        })
        .then((res) => console.log("success in patching event", res))
        .catch((err) =>
          console.log("there was an error in patching the event", err)
        );
    }
  }

  res.send({ res: "successfull" });
});

// send back all events and mark events that have been booked by other students
app.post("/getUserEvents", async (req, res) => {
  // uid to check against all events in calendar
  const targetUid = req.body.uid;

  // array to hold all events to be sent back (after events have been edited )
  let finalEvents = [];

  // get all the events in the calendar
  const events = await calendar.events
    .list({
      auth: OAuth2Client,
      calendarId: "primary",
      maxResults: 100000,
      singleEvents: true,
      orderBy: "startTime",
    })
    .then((res) => {
      return res.data.items;
    });

  console.log(events);

  // loop through all the events and create FullCalendar events to be sent back
  for (let x = 0; x < events.length; x++) {
    if (events[x].description === targetUid) {
      // case 1 - the event belongs to the user and unbooked
      finalEvents.push({
        id: events[x].id,
        title: events[x].summary,
        start: events[x].start.dateTime,
        end: events[x].end.dateTime,
        className: ["bg-red-600 text-white"],
        backgroundColor: "white",
        extendedProps: { booked: true },
      });
    } else if (typeof events[x].description !== "undefined") {
      // case 2 - the event belongs to the user and is booked

      finalEvents.push({
        id: events[x].id,
        title: events[x].summary,
        start: events[x].start.dateTime,
        end: events[x].end.dateTime,
        className: ["bg-blue-600 text-white"],
        backgroundColor: "white",
        extendedProps: { booked: true },
      });
    } else {
      // case 3 - the event does not belong to the user

      finalEvents.push({
        id: events[x].id,
        title: events[x].summary,
        start: events[x].start.dateTime,
        end: events[x].end.dateTime,
        className: ["bg-base text-white"],
        backgroundColor: "white",
        extendedProps: { booked: false },
      });
    }
  }

  res.send({ events: finalEvents });
});

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
      res.send(JSON.stringify({ uid: uid }));
    })
    .catch((error) => {
      console.log("there was an error in verify", error);
    });
});

app.use(cors);

exports.app = functions.https.onRequest(app);
