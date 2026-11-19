// Proposal objective: safely reserve/release daily diver capacity under concurrent bookings.
const Capacity = require('../models/Capacity');
const Setting = require('../models/Setting');

async function defaultLimit() {
  const setting = await Setting.findOne({ key: 'maxDiversPerDay' });
  return setting ? Number(setting.value) : 30;
}

async function getOrCreateCapacity(date) {
  let capacity = await Capacity.findOne({ date });
  if (capacity) return capacity;
  try {
    capacity = await Capacity.create({ date, maxDivers: await defaultLimit(), currentCount: 0, blocked: false });
  } catch (error) {
    if (error.code !== 11000) throw error;
    capacity = await Capacity.findOne({ date });
  }
  return capacity;
}

async function getCapacitySnapshot(date) {
  const capacity = await Capacity.findOne({ date });
  if (capacity) return capacity;
  return { date, maxDivers: await defaultLimit(), currentCount: 0, blocked: false };
}

async function reserveCapacity(date, numDivers) {
  await getOrCreateCapacity(date);
  const capacity = await Capacity.findOneAndUpdate({
    date,
    blocked: false,
    $expr: { $lte: [{ $add: ['$currentCount', numDivers] }, '$maxDivers'] }
  }, { $inc: { currentCount: numDivers } }, { new: true });
  return capacity;
}

async function releaseCapacity(date, numDivers) {
  await Capacity.findOneAndUpdate({ date, currentCount: { $gte: numDivers } }, {
    $inc: { currentCount: -numDivers }
  });
}

module.exports = { defaultLimit, getOrCreateCapacity, getCapacitySnapshot, reserveCapacity, releaseCapacity };
