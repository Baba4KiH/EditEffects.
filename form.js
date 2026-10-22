(function () {
  const form = document.getElementById('brief-form');
  if (!form) return;
  const result = document.getElementById('form-result');
  const button = form.querySelector('[type="submit"]');
  const endpoint = window.EE_FORM_CONFIG?.endpoint || '/api/brief';
  if (endpoint) form.querySelector('.form-note').textContent = 'Оставьте заявку — свяжемся с вами, чтобы обсудить проект.';

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled || String(form.elements.namedItem('website').value).trim() || !form.reportValidity()) return;
    const data = new FormData(form);
    const payload = {
      name: String(data.get('name') || '').trim(),
      contact: String(data.get('contact') || '').trim(),
      task: String(data.get('task') || '').trim(),
      website: String(data.get('website') || ''),
      privacy_consent: form.elements.namedItem('privacy_consent').checked,
    };
    if (!payload.contact || !payload.task || !payload.privacy_consent) {
      result.textContent = 'Заполните контакт, описание проекта и подтвердите согласие.';
      return;
    }
    const label = button.innerHTML;
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    result.textContent = '';
    try {
        button.textContent = 'Отправляем…';
        const response = await fetch(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
        });
        const answer = await response.json();
        if (!response.ok || answer.ok !== true) {
          result.textContent = answer.error || 'Не удалось подтвердить отправку. Попробуйте позже или напишите нам в Telegram.';
          return;
        }
        result.textContent = 'Заявка отправлена. Скоро свяжемся с вами.';
    } catch {
      result.textContent = 'Не удалось подтвердить отправку. Проверьте соединение или напишите нам в Telegram. Чтобы избежать дублирования, не отправляйте заявку несколько раз подряд.';
    } finally {
      button.innerHTML = label;
      button.disabled = false;
      form.setAttribute('aria-busy', 'false');
    }
  });

  // Enable submission only after its handler has been installed successfully.
  document.getElementById('form-unavailable').hidden = true;
  button.removeAttribute('aria-describedby');
  button.disabled = false;
})();

