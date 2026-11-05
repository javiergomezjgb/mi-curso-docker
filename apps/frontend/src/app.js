// Frontend mínimo: consulta la API a través del proxy de Nginx (/api -> api:3000).
async function show(id, url, options) {
  const el = document.getElementById(id);
  try {
    const res = await fetch(url, options);
    el.textContent = JSON.stringify(await res.json(), null, 2);
  } catch (err) {
    el.textContent = `Error: ${err.message}`;
  }
}

function refresh() {
  show('health', '/api/health');
  show('jobs', '/api/jobs/stats');
}

document.getElementById('enqueue').addEventListener('click', async () => {
  await fetch('/api/jobs', { method: 'POST' });
  setTimeout(refresh, 500);
});

refresh();
setInterval(refresh, 5000);
