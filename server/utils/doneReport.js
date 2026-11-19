const { isRealDateString } = require('./dates');

function getDoneReportRange(period, filters, today) {
  if (period === 'daily') {
    if (!isRealDateString(filters.date)) throw new TypeError('Choose a valid visit date for the daily report.');
    return { from: filters.date, through: filters.date };
  }
  if (period === 'monthly') {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(filters.month || '') ||
        Number(filters.month.slice(0, 4)) < 1000) {
      throw new TypeError('Choose a valid month for the monthly report.');
    }
    const [year, month] = filters.month.split('-').map(Number);
    return {
      from: `${filters.month}-01`,
      through: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
    };
  }
  if (period === 'yearly') {
    if (!/^\d{4}$/.test(filters.year || '') || Number(filters.year) < 1000) {
      throw new TypeError('Choose a valid year for the annual report.');
    }
    return { from: `${filters.year}-01-01`, through: `${filters.year}-12-31` };
  }
  const years = Number((/^([1-3])-year$/.exec(period) || [])[1]);
  if (!years || !isRealDateString(today)) {
    throw new TypeError('Choose a valid reporting period.');
  }
  const [year, month, day] = today.split('-').map(Number);
  const startYear = year - years;
  const lastDay = new Date(Date.UTC(startYear, month, 0)).getUTCDate();
  return {
    from: `${startYear}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`,
    through: today
  };
}

module.exports = { getDoneReportRange };
