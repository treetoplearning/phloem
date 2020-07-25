const functions = require("firebase-functions");
const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const cors = require("cors")({ origin: "*" });
const { google } = require("googleapis");
const path = require("path");
const md5 = require("md5");
const isToday = require("date-fns/isToday");
const AccessToken = require("twilio").jwt.AccessToken;
const VideoGrant = AccessToken.VideoGrant;
require("dotenv").config();

// initialize the Firebase admin ccount
let admin = require("firebase-admin");

// Google Calendar configurations
const googleCredentials = require("./calendar-credentials.json");
const { constants } = require("os");

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

admin.initializeApp();

app.use(express.static(path.join(__dirname, "build")));
app.use("*", cors);
app.use(bodyParser.json());

// book the input lesson for the user and send back
app.post("/bookLesson", async (req, res) => {
  const fullName = req.body.firstName + " " + req.body.lastName;
  const email = req.body.email;
  const targetLessonId = req.body.lessonId;
  const maskedUID = md5(req.body.uid);

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

  // ensure that the user only has one event booked max
  for (let x = 0; x < events.length; x++) {
    if (events[x].description === maskedUID) {
      res.send({ message: "maxBooked" });
      return;
    }
  }

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
      targetLesson.description = maskedUID;

      // save updates to the calendar
      calendar.events
        .patch({
          auth: OAuth2Client,
          calendarId: "primary",
          eventId: targetLessonId,
          resource: targetLesson,
        })
        .then((res) => console.log("success in patching event", res))
       
    }
  }

  res.send({ message: "successful" });
});

app.post("/getIDEToken", (req, res) => {
  let maskedIDEToken = md5(md5(req.body.uid))
  res.send({IDEToken: maskedIDEToken})
})

// return the next meeting
app.post("/getNextMeeting", async (req, res) => {
  let maskedUID = md5(req.body.uid);

  // variable for when to start looking for events
  let currentTime = new Date().toISOString();

  const nextEvents = await calendar.events
    .list({
      auth: OAuth2Client,
      calendarId: "primary",
      maxResults: 1000,
      singleEvents: true,
      orderBy: "startTime",
      timeMin: currentTime,
    })
    .then((res) => {
      return res.data.items;
    });

    // check if the admin is requesting the next lesson
    if (maskedUID === functions.config().admin_user.id) {
      if (nextEvents.length !== 0) {
        // if next meeting exists also send the IDE hash so both users can share code
        res.send({startTime: nextEvents[0].start, stopTime: nextEvents[0].end})
      } else {
        res.send({startTime: -1, stopTime: -1})
      }
      
      return;
    }

  // iterate through all ongoing or future events and return first date that matches user UID
  for (let x = 0; x < nextEvents.length; x++) {
    if (nextEvents[x].description === maskedUID) {
      
      res.send({ startTime: nextEvents[x].start, stopTime: nextEvents[x].end });
      return;
    }
  }

  // if there is no future event that matches the input uid
  res.send({ startTime: -1, stopTime: -1 });
});

// send back all events and mark events that have been booked by other students
app.post("/getUserEvents", async (req, res) => {
  // uid to check against all events in calendar

  const maskedUID = md5(req.body.uid);

  const firstName = req.body.firstName;
  const lastName = req.body.lastName;
  const fullName = firstName + " " + lastName;

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

  // loop through all the events and create FullCalendar events to be sent back
  for (let x = 0; x < events.length; x++) {

    // make an array to check all id's in the description
    if (events[x].description === maskedUID) {
      // case 1 - the event belongs to the user and unbooked
      finalEvents.push({
        id: events[x].id,
        title: fullName,
        start: events[x].start.dateTime,
        end: events[x].end.dateTime,
        className: ["bg-blue-600 text-white hover:opacity-75"],
        backgroundColor: "white",
        extendedProps: { booked: true },
      });
    } else if (typeof events[x].description !== "undefined") {
      // case 2 - the event belongs to the user and is booked

      finalEvents.push({
        id: events[x].id,
        title: "Busy",
        start: events[x].start.dateTime,
        end: events[x].end.dateTime,
        className: ["bg-red-500 text-white hover:opacity-75"],
        backgroundColor: "white",
        extendedProps: { booked: true },
      });
    } else {
      // case 3 - the event does not belong to the user

      finalEvents.push({
        id: events[x].id,
        title: "Free",
        start: events[x].start.dateTime,
        end: events[x].end.dateTime,
        className: ["bg-base text-white hover:opacity-75"],
        backgroundColor: "white",
        extendedProps: { booked: false },
      });
    }
  }

  res.send({ events: finalEvents });
});

// Twilio Video
app.post("/token", async (req, res) => {

  const uid = req.body.identity;
  const maskedUID = md5(uid);

  const token = new AccessToken(
    functions.config().twilio.account_sid,
    functions.config().twilio.api_key_sid,
    functions.config().twilio.api_key_secret,
    {
      ttl: 14400,
    }
  );

  // variable for when to start looking for events
  let currentTime = new Date().toISOString();

  const nextEvents = await calendar.events
    .list({
      auth: OAuth2Client,
      calendarId: "primary",
      maxResults: 1000,
      singleEvents: true,
      orderBy: "startTime",
      timeMin: currentTime,
    })
    .then((res) => {
      return res.data.items;
    })
    .catch((err) => {
      console.log("There was an error in retrieving the next events")
    })

  // get access to the current lesson if req comes from an 
  if (functions.config().admin_user.id === maskedUID) {
  
    token.identity = md5(uid);

    const currentRoomName = nextEvents[0].description
    console.log(currentRoomName)
  
    const videoGrant = new VideoGrant({ room: currentRoomName });
    token.addGrant(videoGrant);
    res.send({accessToken: token.toJwt(), roomName: currentRoomName})
    return
  }

  // iterate through all ongoing or future events and return first date that matches user UID and is today
  for (let x = 0; x < nextEvents.length; x++) {
    if (nextEvents[x].description === maskedUID) {
      const nextEvent = new Date(nextEvents[x].start.dateTime);

      // send an error back if the user's earliest event is not today
      if (!isToday(nextEvent)) {
        return res.status(400).send({
          message: 'error'
       });
      
      } 
    }
  }

  token.identity = uid;

  const videoGrant = new VideoGrant({ room: maskedUID });
  token.addGrant(videoGrant);
  res.send({accessToken: token.toJwt(), roomName: maskedUID})

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

// firebase verification
app.get("/testing", (req, res) => {
  res.send("successful call to /testing")
});

// app.use(cors);

exports.app = functions.https.onRequest(app);
