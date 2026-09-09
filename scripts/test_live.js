async function run() {
  const loginRes = await fetch('https://thawhlawmptr.pages.dev/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'bial1', password: 'password123' })
  });
  const { token } = await loginRes.json();

  const aprilRes = await fetch('https://thawhlawmptr.pages.dev/api/tithes?bial_id=6&year=2026&month=4', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const aprilData = await aprilRes.json();
  console.log('April Tithes Summary:', aprilData.summary);
  console.log('April Member 1:', aprilData.members[0]);
}

run();
