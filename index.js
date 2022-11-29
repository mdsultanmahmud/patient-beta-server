const express = require('express')
const app = express()
const port = process.env.PORT || 5000
const cors = require('cors')
require('dotenv').config()
const jwt = require('jsonwebtoken')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const nodemailer = require("nodemailer");
const mg = require('nodemailer-mailgun-transport')
// middlewear
app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
    res.send('Patient Beta server is running...')
})

app.listen(port, () => {
    console.log('server is running from port: ', port)
})

// send email to user after booking to confirm 
const confirmBookingEmail = (booking) =>{
    console.log(booking)
    const {email, treatment, appointmentDate, selectedTime} = booking
    // let transporter = nodemailer.createTransport({
    //     host: 'smtp.sendgrid.net',
    //     port: 587,
    //     auth: {
    //         user: "apikey",
    //         pass: process.env.SENDGRID_API_KEY
    //     }
    //  })

    const auth = {
        auth: {
          api_key: process.env.SENDGRID_API_KEY,
          domain: process.env.SENDMAIL_DOMAIN
        }
      }

      const nodemailerMailgun = nodemailer.createTransport(mg(auth));

      nodemailerMailgun.sendMail({
        from: "mdsultanmahmud.bd00@gmail.com", // verified sender email
        to: email || 'mdsultanmahmud.bd00@gmail.com', // recipient email
        subject: `Your appointment accepted.`, // Subject line
        text: "Hello world!", // plain text body
        html: `
            <div>
                <h1>Your appointment accepted for ${treatment}.</h1>
                <p>Appointment date is ${appointmentDate} and your time ${selectedTime}</p>
                <h4>Thank you</h4>
                <h4>patient beta</h4>
            </div>
        `, // html body
      }, function(error, info){
        if (error) {
          console.log(error);
        } else {
          console.log('Email sent: ' + info.response);
        }
      });
     
}

// verify access token 
const verifyToken = async (req, res, next) => {
    // console.log(req.headers.authorizationtoken)
    const accessTokenHeader = req.headers.authorizationtoken
    if (!accessTokenHeader) {
        return res.status(401).send({
            success: false,
            message: 'Unauthorized access'
        })
    }

    const token = accessTokenHeader.split(' ')[1]
    jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
            return res.send({
                success: false,
                message: 'Unauthorized access'
            })
        }
        req.decoded = decoded
        next()
    })
}



// starting mongodb 
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.p11nzlu.mongodb.net/?retryWrites=true&w=majority`
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
async function run() {
    const AppointmentServices = client.db('PatientBeta').collection('appServices')
    const Booking = client.db('PatientBeta').collection('bookings')
    const Users = client.db('PatientBeta').collection('users')
    const Doctors = client.db('PatientBeta').collection('doctors')
    const Payments = client.db('PatientBeta').collection('payments')
    // get all appointment services  *** use aggregate to query multiple collection and merge data 

    // Note: verify admin after verification jwt token 
    const verifyAdmin = async (req, res, next) => {
        const userEmail = req.decoded.email
        const filter = {
            email: userEmail
        }
        const user = await Users.findOne(filter)
        if (user.role !== 'admin') {
            return res.send({
                success: false,
                message: 'You are not admin, you have no permission  for making admin.'
            })
        }

        next()
    }

    app.get('/appointmentServicess', async (req, res) => {
        const date = req.query.date
        const cursor = AppointmentServices.find({})
        const allAppServices = await cursor.toArray()
        const bookingQuery = { appointmentDate: date }
        const bookedServices = await Booking.find(bookingQuery).toArray()
        allAppServices.forEach(service => {
            const matchedBookServices = bookedServices.filter(book => book.treatment === service.name)
            const bookingSlots = matchedBookServices.map(booksl => booksl.selectedTime)
            const remainingSlots = service.slots.filter(slot => !bookingSlots.includes(slot))
            service.slots = remainingSlots
        })
        res.send(allAppServices)
    })

    // get appontment services with specific field 
    app.get('/appointmentSpeciality', async (req, res) => {
        const result = await AppointmentServices.find({}).project({ name: 1 }).toArray()
        res.send(result)
    })

    // get all bookings for a specific email 
    app.get('/bookings', verifyToken, async (req, res) => {
        const searchEmail = req.query.email
        const email = req.decoded.email
        if (email !== searchEmail) {
            return res.send({
                success: false,
                message: 'Unauthorized access'
            })
        }

        const query = {
            email: searchEmail
        }
        const result = await Booking.find(query).toArray()
        res.send(result)
    })

    // post a booking user 
    app.post('/bookings', async (req, res) => {
        const bookingPatient = req.body
        const query = {
            appointmentDate: bookingPatient.appointmentDate,
            treatment: bookingPatient.treatment,
            email: bookingPatient.email
        }
        const bookedAppOnDay = await Booking.find(query).toArray()

        if (bookedAppOnDay.length) {
            return res.send({
                success: false,
                message: `You have already booked on ${bookingPatient.appointmentDate}`
            })
        }
        const result = await Booking.insertOne(bookingPatient)
        confirmBookingEmail(bookingPatient)
        res.send(result)

    })

    // specific bookings data 
    app.get('/bookings/:id', async (req, res) => {
        const id = req.params.id
        const query = {
            _id: ObjectId(id)
        }
        const result = await Booking.findOne(query)
        res.send(result)
    })

    // create user 
    app.post('/users', async (req, res) => {
        const user = req.body
        const result = await Users.insertOne(user)
        res.send(result)
    })

    // get all users 
    app.get('/users', async (req, res) => {
        const result = await Users.find({}).toArray()
        res.send(result)
    })

    app.put('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
        const id = req.params.id
        const filter = {
            _id: ObjectId(id)
        }

        const option = { upsert: true }
        const updatedUser = {
            $set: {
                role: 'admin'
            }
        }

        const result = await Users.updateOne(filter, updatedUser, option)
        res.send(result)
    })

    // check admin or not 
    app.get('/users/admin/:email', async (req, res) => {
        const email = req.params.email
        const query = {
            email: email
        }

        const user = await Users.findOne(query)
        res.send({
            isAdmin: user?.role === 'admin'
        })
    })

    // create access token and send it client side 

    app.get('/jwt', async (req, res) => {
        const email = req.query.email
        const query = {
            email: email
        }
        const user = await Users.findOne(query)
        if (user) {
            const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '2h' })
            return res.send({
                success: true,
                accessToken: token
            })
        }
        return res.send({
            success: false,
            accessToken: 'null'
        })
    })


    // deal with adding doctor 
    app.post('/doctors', verifyToken, verifyAdmin, async (req, res) => {
        const doctor = req.body
        const result = await Doctors.insertOne(doctor)
        res.send(result)
    })
    // get all doctors 
    app.get('/doctors', verifyToken, verifyAdmin, async (req, res) => {
        const query = {}
        const result = await Doctors.find(query).toArray()
        res.send(result)
    })
    // delete doctors 
    app.delete('/doctors/:id', verifyToken, verifyAdmin, async (req, res) => {
        const id = req.params.id
        const query = {
            _id: ObjectId(id)
        }
        const result = await Doctors.deleteOne(query)
        res.send(result)
    })


    // handle stripe payment method 
    app.post('/create-payment-intent', async (req, res) => {
        const bookingAppointment = req.body
        const price = bookingAppointment.price
        const amount = price * 100;
        const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency: 'usd',
            "payment_method_types": [
                'card'
            ]
        })

        res.send({
            clientSecret: paymentIntent.client_secret,
        });
    })

    // save some information about payment after payment 
    app.post('/payment', async(req,res) =>{
        const paymentInfo = req.body 
        const result = await Payments.insertOne(paymentInfo)
        const bookingId = paymentInfo.paymentId 
        const query = {
            _id: ObjectId(bookingId)
        }
        const option = {upsert: true}
        const updateBooked = {
            $set:{
                paid: true,
                transactionId: paymentInfo.transectionId
            }
        }

        const bookResult = await Booking.updateOne(query, updateBooked, option)
        res.send(result)
    })

}
run().catch(e => console.log(e))