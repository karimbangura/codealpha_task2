(() => {
  const expressionEl = document.getElementById('expression');
  const resultEl = document.getElementById('result');
  const keysEl = document.getElementById('keys');
  const opButtons = [...document.querySelectorAll('[data-action="operator"]')];

  const MAX_DIGITS = 15;

  /* ---------- state ---------- */
  const state = {
    current: '0',     // the number being typed (or the last result)
    previous: null,   // the first operand, waiting for the second one
    operator: null,   // + − × ÷
    overwrite: false, // true when the next digit should start a new number
    error: null,      // error message, or null
    expression: ''    // small line above the result
  };

  /* ---------- math ---------- */
  function compute(a, op, b) {
    const x = parseFloat(a);
    const y = parseFloat(b);
    switch (op) {
      case '+': return x + y;
      case '−': return x - y;
      case '×': return x * y;
      case '÷': return y === 0 ? null : x / y;
      default:  return y;
    }
  }

  // Fix floating point noise (0.1 + 0.2 -> 0.3) and avoid huge/tiny exponents in the UI
  function toNumberString(n) {
    if (n === null || !isFinite(n)) return null;
    const r = parseFloat(n.toPrecision(12));
    const abs = Math.abs(r);
    if (abs !== 0 && (abs >= 1e15 || abs < 1e-6)) {
      return r.toExponential(6).replace(/\.?0+e/, 'e');
    }
    return String(r);
  }

  /* ---------- formatting ---------- */
  function format(str) {
    if (str.includes('e')) return str;
    const negative = str.startsWith('-');
    const body = negative ? str.slice(1) : str;
    const [int, dec] = body.split('.');
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (negative ? '-' : '') + grouped + (dec !== undefined ? '.' + dec : '');
  }

  function render() {
    if (state.error) {
      resultEl.textContent = state.error;
      resultEl.classList.add('is-error');
      resultEl.dataset.size = '';
    } else {
      const text = format(state.current);
      resultEl.textContent = text;
      resultEl.classList.remove('is-error');
      resultEl.dataset.size = text.length > 13 ? 'sm' : text.length > 9 ? 'md' : '';
    }
    expressionEl.textContent = state.expression;

    // highlight the operator that is waiting for the next number
    opButtons.forEach(btn => {
      const active = state.operator === btn.dataset.value && state.overwrite && !state.error;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  /* ---------- actions ---------- */
  function reset() {
    state.current = '0';
    state.previous = null;
    state.operator = null;
    state.overwrite = false;
    state.error = null;
    state.expression = '';
  }

  function inputDigit(d) {
    if (state.error) reset();
    if (state.overwrite) {
      state.current = d;
      state.overwrite = false;
      // starting a fresh number after "=" also clears the old expression
      if (!state.operator) state.expression = '';
    } else if (state.current === '0') {
      state.current = d;
    } else if (state.current.replace(/[-.]/g, '').length < MAX_DIGITS) {
      state.current += d;
    }
  }

  function inputDot() {
    if (state.error) reset();
    if (state.overwrite) {
      state.current = '0.';
      state.overwrite = false;
      if (!state.operator) state.expression = '';
    } else if (!state.current.includes('.')) {
      state.current += '.';
    }
  }

  function setError(message) {
    reset();
    state.error = message;
  }

  function chooseOperator(op) {
    if (state.error) return;

    // pressing two operators in a row just swaps the operator
    if (state.operator && state.overwrite) {
      state.operator = op;
      state.expression = `${format(state.previous)} ${op}`;
      return;
    }

    // chaining: 5 + 3 × ... evaluates 5 + 3 first
    if (state.operator && state.previous !== null) {
      const result = toNumberString(compute(state.previous, state.operator, state.current));
      if (result === null) { setError('Cannot divide by zero'); return; }
      state.current = result;
    }

    state.previous = state.current;
    state.operator = op;
    state.overwrite = true;
    state.expression = `${format(state.previous)} ${op}`;
  }

  function equals() {
    if (state.error || !state.operator || state.previous === null) return;

    const left = state.previous;
    const right = state.current;
    const result = toNumberString(compute(left, state.operator, right));
    if (result === null) { setError('Cannot divide by zero'); return; }

    state.expression = `${format(left)} ${state.operator} ${format(right)} =`;
    state.current = result;
    state.previous = null;
    state.operator = null;
    state.overwrite = true;
  }

  function backspace() {
    if (state.error) { reset(); return; }
    if (state.overwrite) return;       // do not edit a finished result
    state.current = state.current.slice(0, -1);
    if (state.current === '' || state.current === '-') state.current = '0';
  }

  function percent() {
    if (state.error) return;
    const cur = parseFloat(state.current);
    let value;
    // 200 + 10 %  ->  10% of 200 = 20
    if (state.previous !== null && (state.operator === '+' || state.operator === '−')) {
      value = parseFloat(state.previous) * cur / 100;
    } else {
      value = cur / 100;
    }
    state.current = toNumberString(value);
    state.overwrite = false;
  }

  function negate() {
    if (state.error || state.current === '0') return;
    state.current = state.current.startsWith('-')
      ? state.current.slice(1)
      : '-' + state.current;
  }

  /* ---------- dispatcher ---------- */
  function press(action, value) {
    switch (action) {
      case 'digit':     inputDigit(value); break;
      case 'dot':       inputDot(); break;
      case 'operator':  chooseOperator(value); break;
      case 'equals':    equals(); break;
      case 'clear':     reset(); break;
      case 'backspace': backspace(); break;
      case 'percent':   percent(); break;
      case 'negate':    negate(); break;
    }
    render();
  }

  /* ---------- mouse / touch ---------- */
  keysEl.addEventListener('click', e => {
    const btn = e.target.closest('.key');
    if (!btn) return;
    press(btn.dataset.action, btn.dataset.value);
  });

  /* ---------- keyboard support ---------- */
  const OPERATOR_KEYS = { '+': '+', '-': '−', '*': '×', 'x': '×', 'X': '×', '/': '÷' };

  function flash(selector) {
    const btn = document.querySelector(selector);
    if (!btn) return;
    btn.classList.add('is-pressed');
    setTimeout(() => btn.classList.remove('is-pressed'), 120);
  }

  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;   // keep browser shortcuts working
    const k = e.key;

    if (/^[0-9]$/.test(k)) {
      press('digit', k);
      flash(`[data-action="digit"][data-value="${k}"]`);
    } else if (k === '.' || k === ',') {
      press('dot');
      flash('[data-action="dot"]');
    } else if (k in OPERATOR_KEYS) {
      e.preventDefault();                              // stops "/" opening quick find
      const op = OPERATOR_KEYS[k];
      press('operator', op);
      flash(`[data-action="operator"][data-value="${op}"]`);
    } else if (k === 'Enter' || k === '=') {
      e.preventDefault();                              // stops Enter re-clicking a focused key
      press('equals');
      flash('[data-action="equals"]');
    } else if (k === 'Backspace') {
      press('backspace');
      flash('[data-action="backspace"]');
    } else if (k === 'Escape' || k === 'Delete') {
      press('clear');
      flash('[data-action="clear"]');
    } else if (k === '%') {
      press('percent');
      flash('[data-action="percent"]');
    }
  });

  render();
})();
