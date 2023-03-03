const express = require("express");
const app = express();
const router = express.Router();
var cors = require("cors");
let bodyParser = require("body-parser");
let multer = require("multer");
let forms = multer();
const serverless = require("serverless-http");

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const bcrypt = require("bcrypt");
const saltRounds = 10;
var jwt = require("jsonwebtoken");

require("dotenv").config();

var allowedOrigins = ["http://localhost:5173"];

app.use(
    cors({
        origin: function (origin, callback) {
            if (!origin) return callback(null, true);
            if (allowedOrigins.indexOf(origin) === -1) {
                var msg =
                    "The CORS policy for this site does not " +
                    "allow access from the specified Origin.";
                return callback(new Error(msg), false);
            }
            return callback(null, true);
        },
    })
);

app.use(bodyParser.json());
app.use(forms.array());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.json());

const port = process.env.PORT || 3000;

router.get("/", (req, res) => {
    res.send("Tracker is running");
});

router.post("/registerUser", async (req, res) => {
    const { email, password, first_name, last_name } = req.body;
    if (!email || !password || !first_name || !last_name)
        return res.status(400).send({ status: 400, msg: "Invalid data" });
    const passwordHash = await bcrypt.hash(password, saltRounds);
    try {
        await prisma.user.create({
            data: {
                email,
                password: passwordHash,
                first_name,
                last_name,
            },
        });
    } catch (error) {
        return res
            .status(400)
            .send({ status: 400, msg: "User already exists" });
    }
    return res
        .status(201)
        .send({ status: 201, msg: "User created. Please Login." });
});

router.post("/checkUser", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
        return res.status(400).send({ status: 400, msg: "Invalid data" });
    try {
        const user = await prisma.user.findUnique({
            where: {
                email,
            },
        });
        if (!user)
            return res.status(400).send({ status: 400, msg: "User not found" });

        const match = await bcrypt.compare(password, user.password);

        if (!match)
            return res
                .status(400)
                .send({ status: 400, msg: "Invalid password" });

        try {
            return res.status(200).send({
                status: 200,
                msg: "Logged in Successfully",
                token: jwt.sign(
                    {
                        firstname: user.first_name,
                        lastname: user.last_name,
                        email: user.email,
                    },
                    process.env.JWT_SECRET
                ),
            });
        } catch (error) {
            return res.status(400).send({ status: 400, msg: "Cannot Login" });
        }
    } catch (error) {
        return res.status(400).send({ status: 400, msg: "User not found" });
    }
});

router.post("/addTracker", async (req, res) => {
    const { email, tracker_name, token } = req.body;
    if (!email || !tracker_name || !token)
        return res.status(400).send({ status: 400, msg: "Invalid data" });

    try {
        const decode = jwt.verify(token, process.env.JWT_SECRET);
        if (decode.email !== email)
            return res.status(400).send({
                status: 400,
                msg: "Invalid token, Please login again.",
            });
        const user = await prisma.user.findUnique({
            where: {
                email,
            },
        });
        if (!user)
            return res.status(400).send({ status: 400, msg: "User not found" });
        const tracker = await prisma.trackers.create({
            data: {
                name: tracker_name,
                user_id: user.id,
            },
        });
        res.status(201).send({
            tracker,
            status: 201,
            msg: "Tracker Created Successfully.",
        });
    } catch (error) {
        return res.status(400).send({
            status: 400,
            msg: "Something Went Wrong. Please Try Again.",
        });
    }
});

router.delete("/deleteTracker", async (req, res) => {
    const { email, tracker_id, token } = req.body;
    if (!email || !tracker_id || !token)
        return res.status(400).send({ status: 400, msg: "Invalid data" });

    try {
        const decode = jwt.verify(token, process.env.JWT_SECRET);
        if (decode.email !== email)
            return res.status(400).send({
                status: 400,
                msg: "Invalid token, Please login again.",
            });
        const user = await prisma.user.findUnique({
            where: {
                email,
            },
        });
        if (!user)
            return res.status(400).send({ status: 400, msg: "User not found" });
        const tracker = await prisma.trackers.findUnique({
            where: {
                id: tracker_id,
            },
        });
        if (!tracker)
            return res
                .status(400)
                .send({ status: 400, msg: "Tracker not found" });

        if (tracker.user_id !== user.id)
            return res.status(400).send({
                status: 400,
                msg: "You are not authorized to delete this tracker.",
            });

        await prisma.trackers.delete({
            where: {
                id: tracker_id,
            },
        });

        res.status(200).send({
            status: 200,
            msg: "Tracker Deleted Successfully.",
        });
    } catch (error) {
        return res.status(400).send({
            status: 400,
            msg: "Something Went Wrong. Please Try Again.",
        });
    }
});

router.get("/track", async (req, res) => {
    const { id } = req.query;
    try {
        const tracker = await prisma.trackers.findUnique({
            where: {
                id,
            },
        });
        if (!tracker)
            return res
                .status(400)
                .send({ status: 400, msg: "Tracker not found" });
        await prisma.trackers.update({
            where: {
                id,
            },
            data: {
                frequency: tracker.frequency + 1,
            },
        });
    } catch (error) {
        console.log(error);
        res.status(400).send({ status: 400, msg: "Tracker not found" });
    }

    res.sendFile("/resources/1x1.png", { root: process.cwd() });
});

router.get("/getTrackers", async (req, res) => {
    const { email, token } = req.query;
    if (!email || !token)
        return res.status(400).send({ status: 400, msg: "Invalid data" });
    try {
        const decode = jwt.verify(token, process.env.JWT_SECRET);
        if (decode.email !== email)
            return res.status(400).send({
                status: 400,
                msg: "Invalid token, Please login again.",
            });

        const user = await prisma.user.findUnique({
            where: {
                email,
            },
        });
        if (!user)
            return res.status(400).send({ status: 400, msg: "User not found" });
        const trackers = await prisma.trackers.findMany({
            where: {
                user_id: user.id,
            },
        });
        res.status(200).send({ trackers });
    } catch (error) {
        return res.status(400).send({
            status: 400,
            msg: "Something Went Wrong. Please Try Again.",
        });
    }
});

app.use("/.netlify/functions/api", router);

// app.listen(port, () => {
//     console.log("Server is running on port " + port);
// });

module.exports.handlers = serverless(app);
