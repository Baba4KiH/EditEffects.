(function () {
  const form = document.getElementById('brief-form');
  if (!form) return;
  const result = document.getElementById('form-result');
  const button = form.querySelector('[type="submit"]');
  const endpoint = window.EE_FORM_CONFIG?.endpoint || '';
  if (endpoint) form.querySelector('.form-note').textContent = 'Оставьте заявку — свяжемся с вами, чтобы обсудить проект.';

  async function copyBrief(text) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { if (!document.execCommand('copy')) throw Error('Copy failed'); }
      finally { area.remove(); }
    }
  }

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
      if (!endpoint) {
        await copyBrief(`Заявка для ee.\nИмя: ${payload.name || 'Не указано'}\nКонтакт: ${payload.contact}\nЗадача: ${payload.task}`);
        result.textContent = 'Заявка скопирована. Теперь её можно отправить студии.';
      } else {
        button.textContent = 'Отправляем…';
        const response = await fetch(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
        });
        const answer = await response.json();
        if (!response.ok || answer.ok !== true) {
          const code = typeof answer.code === 'string' && /^TELEGRAM_[A-Z_]+$/.test(answer.code) ? ' [' + answer.code + ']' : '';
          result.textContent = (answer.error || 'Не удалось подтвердить отправку. Попробуйте позже.') + code;
          return;
        }
        result.textContent = 'Заявка отправлена. Скоро свяжемся с вами.';
      }
    } catch {
      result.textContent = endpoint
        ? 'Не удалось получить ответ сервера формы. Проверьте, что npm start запущен и страница открыта по адресу этого сервера. Доставка не подтверждена; перед повтором проверьте чат.'
        : 'Не удалось скопировать заявку. Попробуйте ещё раз.';
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

