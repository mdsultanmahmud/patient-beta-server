const express = require('express')
const app = express()
const port = process.env.PORT || 5000
const cors = require('cors')
require('dotenv').config()
const jwt = require('jsonwebtoken')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
// middlewear

app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
    res.send('Patient Beta server is running...')
})

app.listen(port, () => {
    console.log('server is running from port: ', port)
})


// verify access token 
const verifyToken = async (req, res, next) => {
    // console.log(req.headers.authorizationtoken)
    const accessTokenHeader = req.headers.authorizationtoken
    if(!accessTokenHeader){
        return res.status(401).send({
            success: false, 
            message: 'Unauthorized access'
        })
    }

    const token = accessTokenHeader.split(' ')[1]
    jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) =>{
        if(err){
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
    // get all appointment services  *** use aggregate to query multiple collection and merge data 

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

    // get all bookings for a specific email 
    app.get('/bookings',verifyToken, async (req, res) => {
        const searchEmail = req.query.email
        const email = req.decoded.email 
        if(email !== searchEmail){
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
        res.send(result)

    })


    // create user 
    app.post('/users', async (req, res) => {
        const user = req.body
        const result = await Users.insertOne(user)
        res.send(result)
    })

    // get all users 
    app.get('/users', async(req,res) =>{
        const result = await Users.find({}).toArray()
        res.send(result)
    })

    app.put('/users/:id', verifyToken, async(req,res) =>{
        const decodedEmail = req.decoded.email 
        const query = {
            email: decodedEmail
        }
        const user = await Users.findOne(query)
        if(user.role !== 'admin'){
            return res.send({
                success: false,
                message: 'You are not admin, you have no permission  for making admin.'
            })
        }

        const id = req.params.id 
        const filter = {
            _id: ObjectId(id)
        }

        const option = {upsert: true}
        const updatedUser = {
            $set:{
                role: 'admin'
            }
        }

        const result = await Users.updateOne(filter, updatedUser, option)
        res.send(result)
    })

    // check admin or not 
    app.get('/users/admin/:email', async(req,res) =>{
        const email = req.params.email 
        console.log(email)
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

}
run().catch(e => console.log(e))