// Proposal objective: provision the initial LGU administrator, defaults, and demonstration bookings.
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Booking = require('./models/Booking');
const Payment = require('./models/Payment');
const Capacity = require('./models/Capacity');
const Setting = require('./models/Setting');
const { createPermit } = require('./utils/qrGenerator');

async function seed() {
  const { getConfig } = require('./config');
  getConfig();
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminName = process.env.SEED_ADMIN_NAME;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    throw new Error('SEED_ADMIN_EMAIL must be set to a valid email address before seeding.');
  }
  if (!adminName || adminName.trim().length < 2) {
    throw new Error('SEED_ADMIN_NAME must be set to the initial administrator name before seeding.');
  }
  if (!adminPassword || adminPassword.length < 16) {
    throw new Error('SEED_ADMIN_PASSWORD must be set to a unique password of at least 16 characters before seeding.');
  }
  if (!['true', 'false', undefined].includes(process.env.SEED_DEMO_DATA)) {
    throw new Error('SEED_DEMO_DATA must be true or false.');
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const password = await bcrypt.hash(adminPassword, 12);
  let admin = await User.findOne({ email: adminEmail.toLowerCase() }).select('+password');
  if (!admin) {
    admin = await User.create({
      name: adminName.trim(),
      email: adminEmail.trim().toLowerCase(),
      password,
      role: 'admin',
      mustChangePassword: true
    });
  }

  await Setting.updateOne({ key: 'fee' }, { $setOnInsert: { key: 'fee', value: 300 } }, { upsert: true });
  await Setting.updateOne({ key: 'maxDiversPerDay' }, { $setOnInsert: { key: 'maxDiversPerDay', value: 30 } }, { upsert: true });

  if (process.env.SEED_DEMO_DATA === 'true') {
    const slots = ['06:00-08:00', '08:00-10:00', '10:00-12:00', '12:00-14:00', '08:00-10:00'];
    const samplePeople = [
      ['Ava Santos', 'ava@example.com', 'Filipino', 'recreational'],
      ['Noah Reyes', 'noah@example.com', 'Filipino', 'recreational'],
      ['Mia Cruz', 'mia@example.com', 'Filipino', 'technical'],
      ['Liam Tan', 'liam@example.com', 'Singaporean', 'recreational'],
      ['Isla Garcia', 'isla@example.com', 'Filipino', 'technical']
    ];
    const now = new Date();
    for (let index = 0; index < samplePeople.length; index++) {
      const date = new Date(now);
      date.setUTCDate(date.getUTCDate() + index + 2);
      const visitDate = date.toISOString().slice(0, 10);
      const bookingId = `TDS-SAMPLE-${String(index + 1).padStart(3, '0')}`;
      const [visitorName, email, nationality, diverType] = samplePeople[index];
      const paymentRef = `SIM-SEED-${String(index + 1).padStart(3, '0')}`;
      const permit = await createPermit(bookingId);
      const result = await Booking.updateOne({ bookingId }, {
        $set: {
          diverType,
          timeSlot: slots[index],
          leadDiverLicenseNumber: `SAMPLE-CERT-${String(index + 1).padStart(3, '0')}`,
          licenseMode: 'individual'
        },
        $setOnInsert: {
          bookingId,
          visitorName,
          email,
          phone: `+63917${String(1000000 + index)}`,
          nationality,
          visitDate,
          numDivers: 1,
          totalAmount: 300,
          paymentMethod: ['gcash', 'maya', 'maya', 'gcash', 'maya'][index],
          paymentStatus: 'paid',
          paymentRef,
          qrCode: permit.value,
          qrImage: permit.image,
          status: 'confirmed',
          paidAt: now,
          createdAt: now
        }
      }, { upsert: true });
      await Payment.updateOne({ referenceNo: paymentRef }, {
        $setOnInsert: {
          bookingId,
          method: ['gcash', 'maya', 'maya', 'gcash', 'maya'][index],
          amount: 300,
          referenceNo: paymentRef,
          status: 'success',
          createdAt: now
        }
      }, { upsert: true });
      if (result.upsertedCount) {
        const capacity = await Capacity.findOne({ date: visitDate });
        if (capacity) await Capacity.updateOne({ date: visitDate }, { $inc: { currentCount: 1 } });
        else await Capacity.create({ date: visitDate, maxDivers: 30, currentCount: 1, blocked: false });
      }
    }
  }

  console.log(`Seed complete. Initial admin account: ${adminEmail.toLowerCase()}`);
  if (process.env.SEED_DEMO_DATA !== 'true') console.log('Demo bookings were not created.');
  await mongoose.disconnect();
}

seed().catch(async error => {
  console.error('Seed failed:', error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
