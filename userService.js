//-------------------------------------------------------------------------------------environment variables
if (process.env.NODE_ENV == 'production') {
    require('dotenv').config({ path: './../.env' });
}

// DB_URI => Mongo DB Database Uri
const dbUri = process.env.DB_URI

// MAIL_ADDRESS
const mailAdress = process.env.MAIL_ADDRESS

// MAIL_PASSWORD
const mailPassword = process.env.MAIL_PASSWORD

// MAIL_SERVICE
const mailService = process.env.MAIL_SERVICE

//-------------------------------------------------------------------------------------modules
// mongodb
const MongoClient = require('mongodb').MongoClient
const uri = dbUri
let db
const dbclient = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
let ObjectId = require('mongodb').ObjectId

// express
const express = require('express')
const app = express()
const port = process.env.USER_SERVICE_PORT
const serverAddress = process.env.SERVER_ADDRESS
// uuid
const {
    v4: uuidv4
} = require('uuid')
// cors
const cors = require('cors')
const corsSettings = {
    cors: {
        origin: serverAddress + '8080',
        methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
}
//bcrypt
const bcrypt = require('bcryptjs')
const saltRounds = 10
// EMail
const nodemailer = require('nodemailer');


//--------------------------------------------------------------------------------------global variables
let userData
sessions = {};



//----------------------------------------------------------------------------------------funcions
function createSession(userData, token) {
    sessions[token] = {
        userId: userData._id,
        createdAt: new Date(),
        modifiedAt: new Date(),
        token: token
    }
}



//--------------------------------------------------------------------------------------------------------------------------------------------------------------------main
//check for expired sessions
setInterval(()=>{
    for(let i in sessions) {
        let time = new Date - sessions[i].modifiedAt
        if(time > 1000*120){
            console.log("closed session: ", sessions[i])
            delete sessions[i]
        };
    }
},1000)



//conect to database
dbclient.connect(err => {
    console.log("User Service connected to Database: FireWatch")
    db = dbclient.db("FireWatch")
    userData = db.collection("userData")
    forestData = db.collection("forests")
    weatherData = db.collection("weather")
    sensorData = db.collection("sensorData")
})

//init API
app.use(express.json())
app.use(cors(corsSettings))
app.use(express.urlencoded({
    extended: true
}))
app.listen(port, () => {
    console.log(`user service live @ ${serverAddress}${port}`)
})


// ------------------------------------------------------------------------------------------------------------------------------------API Endpoints
// register endpoint
app.post('/api/register', (req, res) => {
    let user = req.body
    let regExp = /^[^ ]+@[^ ]+\.[a-z]{2,6}$/;
    // check if req form is complete
    if (user.username === '' || !regExp.test(user.email) || user.password === '') {
        let reqFail = {
            username: undefined,
            email: undefined,
            password: undefined
        }
        if (user.username === '') {
            reqFail.username = true
        }
        if (!regExp.test(user.email)) {
            reqFail.email = true
        }
        if (user.password === '') {
            reqFail.password = true
        }
        res.status(200).send({
            action: "register",
            success: false,
            message: {
                reqFail,
                msg: "register form is false"
            }
        });
    }
    // if register form is complete
    else {
        // check if email address is already in use
        userData.findOne({
                email: user.email
            })
            .then((dbres) => {
                //if email address already exists
                if (dbres) {
                    res.status(200).send({
                        action: "register",
                        success: false,
                        message: "email address already in use",
                        insertError: true
                    });
                //if email adress does not exist 
                } else if (!dbres) {
                    user.createdAt = new Date();
                    user.hashedPwd = bcrypt.hashSync(user.password, saltRounds)
                    delete user.password

                    // add user to database
                    userData.insertOne(user, (err) => {
                        if (err) {
                            console.log("insertError: ", err);
                            res.status(500).send({
                                action: "register",
                                success: false,
                                message: "error while inserting into mongoDB",
                                insertError: err
                            });
                        } else {
                        // login user after registration
                            userData.findOne({
                                    email: user.email
                                })
                                .then((dbres) => {
                                    let token = uuidv4();
                                    createSession(dbres, token)
                                    delete dbres.hashedPwd
                                    res.status(200).send({
                                        action: "register",
                                        success: true,
                                        message: "created new user in database",
                                        insertError: null,
                                        user: dbres,
                                        token: token
                                    });


                                    // send TestCode via E-Mail
                                    let transporter = nodemailer.createTransport({
                                        service: process.env.mailService,
                                        auth: {
                                          user: process.env.mailAdress,
                                          pass: process.env.mailPassword
                                        }
                                      });
                                      
                                      let mailOptions = {
                                        from: process.env.mailAdress,
                                        to: dbres.email,
                                        subject: 'Fire Watch Registration',
                                        html: '<h1>Welcome to FireWatch!</h1><br><h3>Use our free forest codes: </h3><br><span style="font-weight: 400">testCode1, testCode2</span>'
                                      };
                                      
                                      transporter.sendMail(mailOptions, function(error, info){
                                        if (error) {
                                          console.log(error);
                                        } else {
                                          console.log('Email sent: ' + info.response);
                                        }
                                      });
                                })
                        }
                    })
                }
            })
    }
})



// login endpoint
app.post('/api/login', (req, res) => {
    let sentData = req.body

    //find email
    userData.findOne({
            email: sentData.email
        })
        .then((dbres) => {
            // no match
            if (!dbres) {
                res.status(200).send({
                    action: "login",
                    success: false,
                    message: "login failed",
                })
            }
            // found matching user
            else {
                if (bcrypt.compareSync(sentData.password, dbres.hashedPwd)) {

                    let token = uuidv4();
                    createSession(dbres, token)
                    delete dbres.hashedPwd
                    
                    res.status(200).send({
                        action: "login",
                        success: true,
                        message: "success",
                        error: null,
                        user: dbres,
                        token: token
                    })
                } else {
                    res.status(200).send({
                        action: "login",
                        success: false,
                        message: "login failed",
                    });
                }
            }
        })
})



// registerForest Endpoint
app.post('/api/registerForest', (req, res) => {
    let sentData = req.body


    // looking for user account
    userData.findOne({
            email: sentData.email
        })
        .then((dbres) => {
            //check token
            if (sessions[sentData.token].userId == dbres._id.toString()) {
                forestData.findOne({
                        forestCode: sentData.forestCode
                    })
                    .then((dbresForest) => {
                        // no match
                        if (!dbresForest) {
                            res.status(200).send({
                                action: "forest registration",
                                success: false,
                                message: "forest does not exist in database",
                            });
                        }
                        //match
                        else if (dbresForest) {
                            let forestExists = false
                            //check if forest is already activated
                            if(dbres.forest){
                                for (let i = 0; i < dbres.forest.length; i++) {
                                    if ((dbres.forest[i]._id).toString() == (dbresForest._id).toString()) {
                                        forestExists = true
                                    }
                                }
                            }
                            if (forestExists === true) {
                                res.status(200).send({
                                    action: "forest registration",
                                    success: false,
                                    message: "forest already activated in account",
                                });
                            } 
                            else if (forestExists === false) {
                                // update user database entry with new forest
                                userData.update({_id: dbres._id}, {
                                    $push: {
                                        forest: dbresForest
                                    }
                                }, (err)=>{
                                    if(err){
                                        res.status(200).send({
                                            action: "forest registration",
                                            success: false,
                                            message: "error inserting forest to user account",
                                            error: err,
                                        });
                                    }
                                    else{
                                        //get updated user entry
                                        userData.findOne({
                                            email: sentData.email
                                        })
                                        .then((dbresUpdate) => {
                                            dbresUpdate.token = sentData.token
                                            res.status(200).send({
                                                action: "forest registration",
                                                userData: dbresUpdate,
                                                success: true,
                                                message: "added forest to user account",
                                            });
                                        })
                                    }
                                })

                                

                            }

                        }
                    })
            }
        })
})



// callPresence Endpoint
app.post('/api/callPresence', (req, res) => {
    userData.findOne({
        email: req.body.email
    })
    .then((dbres) => {
        //check token
        if(req.body.token && dbres){
            if(sessions[req.body.token]){
                if (sessions[req.body.token].userId == dbres._id.toString()){
                    // update modifiedAt
                    sessions[req.body.token].modifiedAt = new Date()

                }
            }
            else{
                res.status(500).send({
                    action: "call Presence",
                    success: false,
                    message: "you are not logged in",
                })
            }
        }
    })
})



// closeSession Endpoint
app.post('/api/closeSession', (req, res) => {
    userData.findOne({
        email: req.body.email
    })
    .then((dbres) => {
        //check token
        if(req.body.token && dbres){
            if(sessions[req.body.token]){
                if (sessions[req.body.token].userId == dbres._id.toString()){
                    delete sessions[req.body.token]
                    console.log("close session: ", req.body.token)
                    res.status(200).send({
                        action: "close Session",
                        success: true,
                        message: "your session is closed",
                    })
                }
            }
            else{
                res.status(500).send({
                    action: "close Session",
                    success: false,
                    message: "you are not logged in",
                })
            }
        }
    })
})



// check sessions
app.post('/api/checkSession', (req, res) => {
    let token = req.body.token
    let userId = req.body.userId
    if(sessions[token]){
        if(sessions[token].userId == userId) {
            res.status(200).send({
                action: "check session",
                success: true,
                checkSession: true,
            })
        }
        else {
            res.status(200).send({
                action: "check session",
                success: true,
                checkSession: false,
            })
        }
    }
})