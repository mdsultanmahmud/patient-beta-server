const express = require('express')
const app = express()
const port = process.env.PORT || 5000
const cors = require('cors')
require('dotenv').config()
const { MongoClient, ServerApiVersion } = require('mongodb');
// middlewear

app.use(cors())
app.use(express.json())

app.get('/', (req, res) =>{
    res.send('Patient Beta server is running...')
})

app.listen(port, () =>{
    console.log('server is running from port: ', port)
})



// starting mongodb 
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.p11nzlu.mongodb.net/?retryWrites=true&w=majority`
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
async function run(){
    const AppointmentServices = client.db('PatientBeta').collection('appServices')
    const Booking = client.db('PatientBeta').collection('bookings')

    // get all appointment services 
    app.get('/appointmentServicess', async(req,res) =>{
        const cursor = AppointmentServices.find({})
        const result = await cursor.toArray()
        res.send(result)
    })

    // post a booking user 
    app.post('/bookings', async(req,res) =>{
        const bookingPatient = req.body
        console.log(bookingPatient)
        const result = await Booking.insertOne(bookingPatient)
        res.send(result) 

    })
}
run().catch(e=>console.log(e))