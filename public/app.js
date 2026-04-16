document.getElementById('leadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const resultEl = document.getElementById('result');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  resultEl.style.display = 'none';

  const payload = {
    name: document.getElementById('name').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    email: document.getElementById('email').value.trim(),
    serviceInterest: document.getElementById('serviceInterest').value,
    source: 'web-form',
  };

  try {
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (res.ok) {
      resultEl.className = 'result success';
      resultEl.textContent = `✓ Thanks ${payload.name}! Check your WhatsApp — we just sent you a message.`;
      e.target.reset();
    } else {
      resultEl.className = 'result error';
      resultEl.textContent = `Error: ${data.error ?? 'Something went wrong'}`;
    }
  } catch (err) {
    resultEl.className = 'result error';
    resultEl.textContent = 'Network error — please try again.';
  }

  resultEl.style.display = 'block';
  btn.disabled = false;
  btn.textContent = 'Get Contacted Now';
});
