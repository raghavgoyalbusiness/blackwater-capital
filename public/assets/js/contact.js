/* Contact form — client validation mirroring the server rules, then JSON POST.
   Without JS the form still posts and the server validates. */
(function () {
  'use strict';
  var form = document.querySelector('[data-enquiry-form]');
  if (!form) return;

  var status = form.querySelector('[data-form-status]');
  var submit = form.querySelector('[type="submit"]');

  var RULES = {
    name: function (v) { return v.trim().length >= 2 ? '' : 'Please enter your full name.'; },
    email: function (v) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Please enter a valid work email address.';
    },
    enquiryType: function (v) { return v ? '' : 'Please select an enquiry type.'; },
    message: function (v) {
      var n = v.trim().length;
      if (n < 20) return 'Please provide at least a short description (20 characters).';
      if (n > 4000) return 'Please keep your message under 4,000 characters.';
      return '';
    },
    consent: function (v, el) { return el.checked ? '' : 'Please confirm you consent to us handling your enquiry.'; }
  };

  function fieldOf(name) { return form.querySelector('[name="' + name + '"]'); }

  function setError(name, msg) {
    var el = fieldOf(name);
    if (!el) return;
    var wrap = el.closest('.field');
    var slot = wrap && wrap.querySelector('.error');
    if (slot) slot.textContent = msg || '';
    if (wrap) wrap.classList.toggle('has-error', !!msg);
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  function validate(name) {
    var rule = RULES[name];
    if (!rule) return true;
    var el = fieldOf(name);
    if (!el) return true;
    var msg = rule(el.value || '', el);
    setError(name, msg);
    return !msg;
  }

  Object.keys(RULES).forEach(function (name) {
    var el = fieldOf(name);
    if (!el) return;
    el.addEventListener('blur', function () { validate(name); });
    el.addEventListener('input', function () {
      var wrap = el.closest('.field');
      if (wrap && wrap.classList.contains('has-error')) validate(name);
    });
    el.addEventListener('change', function () {
      var wrap = el.closest('.field');
      if (wrap && wrap.classList.contains('has-error')) validate(name);
    });
  });

  function show(kind, text) {
    if (!status) return;
    status.className = 'form__status is-on form__status--' + kind;
    status.textContent = text;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var ok = Object.keys(RULES).map(validate).every(Boolean);
    if (!ok) {
      show('err', 'Please review the highlighted fields and try again.');
      var bad = form.querySelector('.field.has-error input, .field.has-error select, .field.has-error textarea');
      if (bad) bad.focus();
      return;
    }

    var data = {
      name: fieldOf('name').value,
      email: fieldOf('email').value,
      organisation: fieldOf('organisation') ? fieldOf('organisation').value : '',
      role: fieldOf('role') ? fieldOf('role').value : '',
      enquiryType: fieldOf('enquiryType').value,
      message: fieldOf('message').value,
      consent: fieldOf('consent').checked,
      company: fieldOf('company') ? fieldOf('company').value : ''
    };

    submit.disabled = true;
    var label = submit.textContent;
    submit.textContent = 'Sending…';
    show('ok', 'Sending your enquiry…');

    fetch('/api/enquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (res) {
        if (res.ok && res.body.ok) {
          form.reset();
          show('ok', 'Thank you. Your enquiry has been received under reference ' + res.body.reference +
            '. A member of the team will respond to enquiries of this type in due course.');
          form.querySelectorAll('.field').forEach(function (f) { f.classList.remove('has-error'); });
          status.focus && status.focus();
        } else if (res.body && res.body.errors) {
          Object.keys(res.body.errors).forEach(function (k) { setError(k, res.body.errors[k]); });
          show('err', 'Please review the highlighted fields and try again.');
        } else {
          show('err', (res.body && res.body.message) || 'We could not submit your enquiry. Please try again.');
        }
      })
      .catch(function () {
        show('err', 'We could not reach the server. Please try again, or email us directly.');
      })
      .finally(function () {
        submit.disabled = false;
        submit.textContent = label;
      });
  });
})();
