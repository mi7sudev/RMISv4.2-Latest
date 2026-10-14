// ============================================================================
// mirdc_middleware — index.js (UPDATED for RMIS integration — drop-in)
// ----------------------------------------------------------------------------
// HOW TO DEPLOY: replace index.js on the VM with this file, then restart the
// process (pm2 restart <name> / node index.js). ZERO new dependencies — it
// uses exactly the packages already in node_modules (express, nodemailer,
// axios, cors, ejs). Default behavior without any .env is IDENTICAL to the
// previous version.
//
// WHAT CHANGED (all additive — existing callers cannot break):
//   1. POST /sendMail now ALSO accepts:
//        - text        → plain-text part of the email (better deliverability)
//        - attachments → [{ filename, content(base64), contentType? }]
//                        (cap: 10 MB total, exceeding → 413)
//      and its 200 response now includes messageId/accepted/rejected
//      (the existing "message" and "defaultReplyTo" keys are unchanged).
//   2. Failure logging to the log service now actually works (the old
//      else-branch was dead code) — same payload shape {system, email,
//      send_status}, send_status "error not send".
//   3. GET /health for monitoring (additive).
//   4. Optional strict auth: if MIDDLEWARE_API_KEY is set in the environment,
//      /sendMail requires the same token in body.api OR an "x-api-key"
//      header. When unset (default) /sendMail stays open exactly like the
//      original — legacy systems keep working untouched.
//   5. Credentials/URLs are env-overridable with the ORIGINAL hardcoded
//      values as fallbacks (SMTP_USER, SMTP_PASS, LOG_URL, LOG_TOKEN) —
//      zero-config deployment stays byte-for-byte compatible.
//   6. JSON body limit raised to 12mb (needed for attachments; legacy tiny
//      JSON bodies are unaffected).
//
// UNCHANGED (byte-identical behavior): POST /iotOperatorsDetails,
//   GET /get-pms-cmms, POST /bmisSupplierDetails, POST /iotmiddleware,
//   the From/replyTo rules, the send-mail.html EJS template path, the
//   success/failure response shapes' original keys, and the log-service
//   payload shape.
// ============================================================================

const nodemailer = require('nodemailer');
const express = require('express');
const app = express();
const feathers = require('@feathersjs/feathers');
const ejs = require('ejs');
const cors = require('cors');
const axios = require('axios');

var fs = require('fs');

// ---------------------------------------------------------------------------
// Environment overrides — ALL fall back to the original hardcoded values, so
// deploying without a .env reproduces the previous behavior exactly.
// ---------------------------------------------------------------------------
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || 'systems@mirdc.dost.gov.ph';
const SMTP_PASS = process.env.SMTP_PASS || 'sanfyjbwltvrwrrt';

const LOG_URL = process.env.LOG_URL || 'http://10.10.120.43:1404/api/logs';
const LOG_TOKEN =
  process.env.LOG_TOKEN ||
  'a44953c75009dfe24f02d31bd89279ccbd2413e758b40ac6bf1ab2cd68738b32b86cf4a52d029721ff7c689a8f67bb5649cd399d64e1f63d15e041f84f106e0918ee29344d8836941d52838bba1a46c64bad9526af0c1dca3fc0193de11156b6bec9d460ddddf3e864e697a3e42827e7ca8bce06d205019be1596cbe8d6950ce';

// Optional strict auth for /sendMail — unset by default (legacy open behavior).
const MIDDLEWARE_API_KEY = process.env.MIDDLEWARE_API_KEY || '';

const MAX_ATTACHMENTS_BYTES = 10 * 1024 * 1024; // 10 MB total, base64 payload

var template = fs.readFileSync(__dirname + '/send-mail.html', 'utf8');

// One SMTP pool for the process lifetime (the original created a transporter
// per request — same options, just reused; behavior identical, less overhead).
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

app.use(express.json({ limit: '12mb' }));
app.use(cors()); // Enable CORS for all routes

// ---------------------------------------------------------------------------
// Log service helper — payload shape is EXACTLY the original:
//   axios.post(LOG_URL, { data: { system, email, send_status } }, { headers: { Authorization: 'Bearer ...' } })
// (kept as fire-and-forget — a log-service outage must never fail the email
//  response, same as the original).
// ---------------------------------------------------------------------------
function postSendLog(system, email, sendStatus) {
  const logData = {
    system: system,
    email: email,
    send_status: sendStatus,
  };
  axios
    .post(
      LOG_URL,
      { data: logData },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + LOG_TOKEN,
        },
      }
    )
    .then((response) => {
      console.log('Log successfully posted:', response.data);
    })
    .catch((error) => {
      console.error('Error posting log:', error.message);
    });
}

// ============================================================================
// LEGACY ENDPOINTS — byte-identical to the original. Other MIRDC systems
// depend on these; do not modify.
// ============================================================================

app.post("/iotOperatorsDetails", async (req, res) => {
    console.log("api:", req.body.api);

    if (req.body.api === "eyJhbGciOiJIUzI1NiIsInR5cCI6ImFjY2VzcyJ5") {
        // Make an HTTP request to the specified URL
        try {
            const response = await axios.get('http://10.10.120.32:3030/operators');
            console.log("res", response);

            // If the response is an object with a 'data' property, use that data
            const filteredData = response.data.data.map((item) => ({
                _id: item._id,
                firstName: item.firstName,
                lastName:item.lastName,
                middleInitia:item.middleInitia,
                position:item.position,
                capability:item.capability,
                machines:item.machines,
                manRate:item.manRate
            }));

            console.log(filteredData);
            const totalOperators = filteredData.length

            res.status(response.status).json({
                data: filteredData,
                total:totalOperators
            });
        } catch (error) {
            console.error('Error making API request:', error);
            res.status(error.response ? error.response.status : 500).json({ error: 'Internal Server Error' });
        }
    } else {
        // Handle the case where req.body.api is not "test"
        res.status(400).json({ error: 'Invalid API value' });
    }
});

app.get( "/get-pms-cmms", async (req , res)=>{
    const response = await axios.get("http://10.10.120.232/cmms/vehicle_pm_sched.php");
    console.log("res", response.data); // Log response data

    // Send response data back to the client
    res.status(200).json(response.data);
})
app.post("/bmisSupplierDetails", async (req, res) => {
    console.log("api:", req.body.api);
    console.log("text:", req.body.text);


    if (req.body.api === "eyJhbGciOiJIUzI1NiIsInR5cCI6ImFjY2VzcyJ5") {
        // Make an HTTP request to the specified URL
        try {
            const response = await axios.get('http://10.10.120.32:3535/suppliers');
            // console.log("res", response.data); // Log response data

            // Send response data back to the client
            res.status(200).json(response.data);
        } catch (error) {
            console.error('Error making API request:', error);
            res.status(error.response ? error.response.status : 500).json({ error: 'Internal Server Error' });
        }
    } else {
        // Handle the case where req.body.api is not "test"
        res.status(400).json({ error: 'Invalid API value' });
    }
});

app.post("/iotmiddleware", async (req, res) => {
    console.log("api:", req.body.api);

    if (req.body.api === "eyJhbGciOiJIUzI1NiIsInR5cCI6ImFjY2VzcyJ5") {
        // Make an HTTP request to the specified URL
        try {
            const response = await axios.get('http://10.10.120.32:3030/requests', {
                params: {
                    $limit: 10000,
                }
            });

            const startDate = new Date("2024-01-01");
            const endDate = new Date("2025-01-01");

            const filteredData = response.data.data
                .filter(item => {
                    const createdDate = new Date(item._dateCREATED);
                    const tsrNo = item.service.sectionCode
                    return createdDate >= startDate && createdDate < endDate && tsrNo.includes('MS');
                })
                .map(item => ({
                    serviceCode: item.service.serviceCode,
                    serviceName: item.service.serviceName,
                    sectionCode: item.service.sectionCode,
                    tstNo: item.tsrNo,
                    targetStartDate: item.targetStartDate,
                    targetDate: item.targetDate,
                    serviceName: item.service.name,
                    jobtype: item.jobtype,
                    cutomerType: item.intExt.name,
                    items: item.items,
                    dateCREATED: item._dateCREATED
                }));
                console.log(filteredData.length)

            const totalLength = filteredData.length;

            res.status(response.status).json({
                data: filteredData,
                totalLength: totalLength
            });
        } catch (error) {
            console.error('Error making API request:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    } else {
        // Handle the case where req.body.api is not "test"
        // res.status(400).json({ error:s 'Invalid API value' });
    }
});


// ============================================================================
// POST /sendMail — email gateway.
//
// Legacy request contract (unchanged, still fully supported):
//   {
//     system:  "SystemName"                       → From display name
//     to:      "a@x.com"                          (cc / bcc also accepted)
//     from:    "reply-to@x.com"                   → becomes the Reply-To header
//     subject: "..."
//     message: "<p>html body</p>"                 → used when "html" is absent
//     html:    { message, url:{link,text}, ... }  → renders send-mail.html
//   }
//
// NEW (optional, additive — RMIS uses these):
//   text:        plain-text body (added as the email's text part)
//   attachments: [{ filename, content: <base64>, contentType? }]
//
// Response 200: { message: "Email sent successfully", defaultReplyTo,
//                 messageId, accepted, rejected }   (last three are new)
// Response 4xx/500: { error: "..." }
//
// Auth: unchanged (open) UNLESS MIDDLEWARE_API_KEY is set in the server
// environment — then body.api or the "x-api-key" header must carry it.
// ============================================================================
app.post("/sendMail", async (req, res) => {
    console.log("system name :", req.body.system);
    res.setHeader('Content-Type', 'application/json');

    // Optional strict mode (off by default — see header comment).
    if (MIDDLEWARE_API_KEY) {
        const provided = req.body.api || req.headers['x-api-key'];
        if (provided !== MIDDLEWARE_API_KEY) {
            return res.status(401).json({ error: 'Invalid API value' });
        }
    }

    // Minimal validation — the original 500'd on these from deep inside
    // nodemailer; a clear 400 keeps broken callers equally broken but
    // diagnosable, and correct callers see no difference.
    if (!req.body.to || typeof req.body.to !== 'string' || !req.body.to.trim()) {
        return res.status(400).json({ error: 'Missing or invalid "to" recipient' });
    }
    if (!req.body.subject && !req.body.message && !req.body.html) {
        return res.status(400).json({ error: 'Missing "subject" and "message"' });
    }

    // Attachments (optional) — validate size before touching SMTP.
    let attachments;
    if (Array.isArray(req.body.attachments) && req.body.attachments.length > 0) {
        let total = 0;
        attachments = [];
        for (const a of req.body.attachments) {
            if (!a || typeof a.content !== 'string' || !a.filename) {
                return res.status(400).json({ error: 'Invalid attachment entry (need filename + base64 content)' });
            }
            total += a.content.length;
            if (total > MAX_ATTACHMENTS_BYTES) {
                return res.status(413).json({ error: 'Attachments exceed the 10 MB limit' });
            }
            const entry = { filename: String(a.filename), content: a.content, encoding: 'base64' };
            if (a.contentType) entry.contentType = String(a.contentType);
            attachments.push(entry);
        }
    }

    try {
        let html = req.body.message;

        if (req.body.html) {
            req.body.html.system = req.body.system;
            html = ejs.render(template, req.body.html);
        }

        const defaultReplyTo = `"${req.body.system || 'IT HelpDesk'}" <${SMTP_USER}>`

        const info = await transporter.sendMail({
            from: defaultReplyTo,
            replyTo: req.body.from,
            to: req.body.to,
            cc: req.body.cc,
            bcc: req.body.bcc,
            subject: req.body.subject,
            html,
            // NEW — optional plain-text part (ignored by the old contract).
            ...(req.body.text ? { text: String(req.body.text) } : {}),
            ...(attachments ? { attachments } : {}),
        });

        console.log('Email sent successfully');
        res.status(200).json({
            message: "Email sent successfully",
            defaultReplyTo,
            // NEW — additive fields for caller-side audit trails (RMIS).
            messageId: info && info.messageId ? info.messageId : null,
            accepted: (info && info.accepted) || [],
            rejected: (info && info.rejected) || [],
        });

        // Success log — SAME payload shape as the original ({system, email,
        // send_status: "200"}).
        postSendLog(req.body.system, req.body.to, "200");
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: "Internal server error" });

        // Failure log — the original intended this but the branch was dead
        // code (res.status(200) is always truthy). Same payload shape, with
        // the original's intended "error not send" status string.
        postSendLog(req.body.system, req.body.to, "error not send");
    }
});


// ---------------------------------------------------------------------------
// GET /health — NEW (additive). Monitoring + connectivity checks from the
// systems this middleware serves. No auth (no data exposed).
// ---------------------------------------------------------------------------
app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok", uptime: process.uptime() });
});

const PORT = process.env.PORT || 3232;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
