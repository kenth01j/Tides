// Proposal objective: analytics KPIs and trends for visitor, revenue, payment, and compliance reporting.
(() => {
  const root = document.querySelector('#reports-dashboard');
  if (!root) return;
  const api = window.Tides.api;
  const charts = {};
  const money = amount => `PHP ${Number(amount || 0).toLocaleString()}`;

  function drawChart(id, config) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), config);
  }

  async function load() {
    const period = document.querySelector('#report-period').value;
    try {
      const data = await api(`/api/reports?period=${encodeURIComponent(period)}`);
      const values = {
        'kpi-adoption': `${data.kpis.platformAdoptionRate.toFixed(1)}%`,
        'kpi-compliance': `${data.kpis.complianceRate.toFixed(1)}%`,
        'kpi-cashless': `${data.kpis.cashlessTransactionRate.toFixed(1)}%`,
        'kpi-processing': `${data.kpis.averageProcessingMinutes.toFixed(1)} min`,
        'kpi-accuracy': `${data.kpis.revenueAccuracy.toFixed(1)}%`,
        'kpi-visitors': data.kpis.visitors.toLocaleString(),
        'kpi-revenue': money(data.kpis.revenue),
        'kpi-violations': data.kpis.violations.toLocaleString()
      };
      Object.entries(values).forEach(([id, value]) => { document.getElementById(id).textContent = value; });
      drawChart('visitors-chart', {
        type: 'bar',
        data: { labels: data.charts.labels, datasets: [{ label: 'Divers', data: data.charts.dailyVisitors, backgroundColor: '#088395', borderRadius: 5 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
      });
      drawChart('revenue-chart', {
        type: 'line',
        data: { labels: data.charts.labels, datasets: [{ label: 'Revenue (PHP)', data: data.charts.revenueTrend, borderColor: '#ff6b6b', backgroundColor: 'rgba(255,107,107,.13)', fill: true, tension: .3 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
      });
      drawChart('payment-chart', {
        type: 'doughnut',
        data: { labels: data.charts.paymentMethods.map(item => item.method.replace('_', ' ').toUpperCase()), datasets: [{ data: data.charts.paymentMethods.map(item => item.amount), backgroundColor: ['#0a4d68', '#088395', '#ff6b6b', '#efa91c'] }] },
        options: { responsive: true, maintainAspectRatio: false }
      });
      document.querySelector('#reports-notice').textContent = '';
    } catch (error) {
      document.querySelector('#reports-notice').textContent = error.message;
    }
  }

  document.querySelector('#report-period').addEventListener('change', load);
  document.querySelector('#export-report').addEventListener('click', async () => {
    try {
      const response = await fetch(`/api/reports/export.csv?period=${encodeURIComponent(document.querySelector('#report-period').value)}`, {
        credentials: 'same-origin'
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Report export failed.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tides-${document.querySelector('#report-period').value}-report.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      document.querySelector('#reports-notice').textContent = error.message;
    }
  });

  load();
})();
