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

    // get all appointment services  *** use aggregate to query multiple collection and merge data 
    
    app.get('/appointmentServicess', async(req,res) =>{
        const date = req.query.date 
        const cursor = AppointmentServices.find({})
        const allAppServices = await cursor.toArray()
        const bookingQuery = {appointmentDate: date}
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
    app.get('/bookings', async (req,res) =>{
        const searchEmail = req.query.email
        const query = {
            email: searchEmail
        }
        const result = await Booking.find(query).toArray()
        res.send(result)
    })

    // post a booking user 
    app.post('/bookings', async(req,res) =>{
        const bookingPatient = req.body
        const query = {
            appointmentDate: bookingPatient.appointmentDate,
            treatment: bookingPatient.treatment,
            email: bookingPatient.email
        }
        const bookedAppOnDay = await Booking.find(query).toArray()
        
        if(bookedAppOnDay.length){
            return res.send({
                success: false,
                message: `You have already booked on ${bookingPatient.appointmentDate}`
            })
        }
        const result = await Booking.insertOne(bookingPatient)
        res.send(result) 

    })
}
run().catch(e=>console.log(e))