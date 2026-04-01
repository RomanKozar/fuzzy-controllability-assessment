/* ============================================================
   DATA
============================================================ */
const TERMS = ['T1', 'T2', 'T3', 'T4', 'T5']
const TERM_LABELS = {
	T1: 'T₁ – низький',
	T2: 'T₂ – нижче середнього',
	T3: 'T₃ – середній',
	T4: 'T₄ – вище середнього',
	T5: 'T₅ – високий',
}

const MODES = [
	{ name: 'C₁ – Штатний', k: 2 },
	{ name: 'C₂ – Позаштатний', k: 7 / 4 },
	{ name: 'C₃ – Критична', k: 3 / 2 },
	{ name: 'C₄ – Надзвичайна', k: 5 / 4 },
	{ name: 'C₅ – Аварійна', k: 3 / 4 },
	{ name: 'C₆ – Аварія', k: 1 / 2 },
	{ name: 'C₇ – Катастрофічна', k: 1 / 4 },
	{ name: 'C₈ – Катастрофа', k: 1 / 8 },
]

const BAR_COLORS = [
	'linear-gradient(90deg,#1e6fff,#00c2ff)',
	'linear-gradient(90deg,#1e6fff,#00c2ff)',
	'linear-gradient(90deg,#1e9fff,#00e5a0)',
	'linear-gradient(90deg,#00c2ff,#00e5a0)',
	'linear-gradient(90deg,#f5a623,#ff6b35)',
	'linear-gradient(90deg,#ff6b35,#ff4c6a)',
	'linear-gradient(90deg,#ff4c6a,#c0003c)',
	'linear-gradient(90deg,#c0003c,#7a0020)',
]

/* Default criteria (airport example) */
const DEFAULT_CRITERIA = [
	{ name: 'K₁ – Інтелект. нагляд', t: 'T5', q: 0.65, v: 7 },
	{ name: 'K₂ – Метеоролог. ІС', t: 'T3', q: 0.8, v: 8 },
	{ name: 'K₃ – Управління виїздом', t: 'T4', q: 0.7, v: 10 },
	{ name: 'K₄ – Моніторинг ЗПС', t: 'T3', q: 0.8, v: 10 },
	{ name: 'K₅ – Програм. забезп.', t: 'T5', q: 0.9, v: 9 },
	{ name: 'K₆ – Відображ. польотів', t: 'T4', q: 0.7, v: 10 },
]

let selectedScenario = 3
let criteria = JSON.parse(JSON.stringify(DEFAULT_CRITERIA))

/* ============================================================
   RENDER CRITERIA
============================================================ */
function renderCriteria() {
	const grid = document.getElementById('criteriaGrid')
	grid.innerHTML = ''
	criteria.forEach((c, i) => {
		const row = document.createElement('div')
		row.className = 'criterion-row'
		row.innerHTML = `
      <div>
        <div class="cr-label">${c.name}</div>
      </div>
      <div>
        <select onchange="criteria[${i}].t=this.value">
          ${TERMS.map(t => `<option value="${t}" ${c.t === t ? 'selected' : ''}>${TERM_LABELS[t]}</option>`).join('')}
        </select>
      </div>
      <div class="q-group">
        <input type="range" min="0" max="1" step="0.01" value="${c.q}"
          oninput="criteria[${i}].q=parseFloat(this.value);this.nextElementSibling.textContent=parseFloat(this.value).toFixed(2)">
        <div class="q-val">${c.q.toFixed(2)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:0.4rem">
        <input type="number" class="w-input" min="1" max="10" value="${c.v}"
          oninput="criteria[${i}].v=parseFloat(this.value)||1" style="flex:1">
        <button class="del-btn" onclick="removeCriterion(${i})" title="Видалити">✕</button>
      </div>
    `
		grid.appendChild(row)
	})
}

function addCriterion() {
	const n = criteria.length + 1
	criteria.push({ name: `K${n} – Показник ${n}`, t: 'T3', q: 0.5, v: 5 })
	renderCriteria()
}

function removeCriterion(i) {
	if (criteria.length <= 1) return
	criteria.splice(i, 1)
	renderCriteria()
}

function selectScenario(s) {
	selectedScenario = s
	document.querySelectorAll('.scenario-btn').forEach(b => {
		b.classList.toggle('active', parseInt(b.dataset.s) === s)
	})
}

/* ============================================================
   MATH
============================================================ */
function termToA(t, termBounds) {
	const idx = TERMS.indexOf(t)
	return termBounds[idx + 1] // a1..a5
}

function computeOi(ti, qi, termBounds) {
	const a = termToA(ti, termBounds)
	return a * qi
}

function sMembership(Oi, a0, al) {
	const mid = (a0 + al) / 2
	if (Oi <= a0) return 0
	if (Oi >= al) return 1
	if (Oi <= mid) return 2 * Math.pow((Oi - a0) / (al - a0), 2)
	return 1 - 2 * Math.pow((al - Oi) / (al - a0), 2)
}

function computeM(scenario, ws, mus) {
	const m = ws.length
	if (scenario === 1) {
		// M1 = 1 / sum(wi/mu(Oi))
		let denom = 0
		for (let i = 0; i < m; i++) denom += ws[i] / (mus[i] || 1e-9)
		return 1 / denom
	} else if (scenario === 2) {
		// M2 = prod(mu(Oi)^wi)
		let prod = 1
		for (let i = 0; i < m; i++) prod *= Math.pow(mus[i], ws[i])
		return prod
	} else if (scenario === 3) {
		// M3 = sum(wi * mu(Oi))
		let s = 0
		for (let i = 0; i < m; i++) s += ws[i] * mus[i]
		return s
	} else {
		// M4 = sqrt(sum(wi * mu(Oi)^2))
		let s = 0
		for (let i = 0; i < m; i++) s += ws[i] * Math.pow(mus[i], 2)
		return Math.sqrt(s)
	}
}

function trendRg(Mg, a, b) {
	// From Mg(S) formula (9): Mg = (Rg-a)/(b-a) => Rg = Mg*(b-a)+a
	if (Mg <= 0) return a
	if (Mg >= 1) return b
	return Mg * (b - a) + a
}

function muC(Rg, a, b, k) {
	if (Rg < a) return 1 - 0
	if (Rg > b) return 1 - 1
	return 1 - Math.pow((Rg - a) / (b - a), k)
}

/* ============================================================
   CALCULATE
============================================================ */
function calculate() {
	const a0 = parseFloat(document.getElementById('paramA0').value)
	const al = parseFloat(document.getElementById('paramAl').value)
	const a = parseFloat(document.getElementById('paramA').value)
	const b = parseFloat(document.getElementById('paramB').value)
	const alpha = parseFloat(document.getElementById('paramAlpha').value)

	// Build term bounds: equal split [a0..al] into 5 parts
	const step = (al - a0) / 5
	const termBounds = [
		a0,
		a0 + step,
		a0 + 2 * step,
		a0 + 3 * step,
		a0 + 4 * step,
		al,
	]

	const m = criteria.length
	const Ois = [],
		mus = []
	let log = ''

	log += `<span class="hl">═══ Крок 1: Фазифікація вхідних даних ═══</span>\n`
	log += `Терм-межі: [${termBounds.map(v => v.toFixed(1)).join('; ')}]\n\n`

	criteria.forEach((c, i) => {
		const Oi = computeOi(c.t, c.q, termBounds)
		const mu = sMembership(Oi, a0, al)
		Ois.push(Oi)
		mus.push(mu)
		log += `  ${c.name}: t=${c.t}, q=${c.q.toFixed(2)}, a_term=${termToA(c.t, termBounds).toFixed(1)}\n`
		log += `    O${i + 1} = ${termToA(c.t, termBounds).toFixed(1)} × ${c.q.toFixed(2)} = <span class="hl">${Oi.toFixed(4)}</span>\n`
		log += `    μ(O${i + 1}) = <span class="hl">${mu.toFixed(4)}</span>\n\n`
	})

	log += `<span class="hl">═══ Крок 2: Нормовані вагові коефіцієнти ═══</span>\n`
	const vSum = criteria.reduce((s, c) => s + c.v, 0)
	const ws = criteria.map(c => c.v / vSum)
	ws.forEach((w, i) => {
		log += `  w${i + 1} = ${criteria[i].v} / ${vSum} = <span class="hl">${w.toFixed(4)}</span>\n`
	})

	log += `\n<span class="hl">═══ Крок 3: Агрегування (сценарій M${selectedScenario}) ═══</span>\n`
	const Mg = computeM(selectedScenario, ws, mus)
	log += `  M${selectedScenario}(S) = <span class="hl">${Mg.toFixed(6)}</span>\n`

	log += `\n<span class="hl">═══ Крок 4: Тренд керованості ═══</span>\n`
	const Rg = trendRg(Mg, a, b)
	log += `  R${selectedScenario} = M${selectedScenario}×(b-a)+a = ${Mg.toFixed(4)}×(${b}-${a})+${a} = <span class="hl">${Rg.toFixed(4)}</span>\n`

	log += `\n<span class="hl">═══ Крок 5: Оцінка за режимами функціонування ═══</span>\n`
	const modeResults = MODES.map(mode => {
		const val = muC(Rg, a, b, mode.k)
		const safe = val >= alpha
		log += `  ${mode.name} (k=${mode.k.toFixed(3)}): μ = <span class="hl">${val.toFixed(4)}</span>  →  ${safe ? '<span class="ok">БЕЗПЕЧНИЙ</span>' : 'НЕБЕЗПЕЧНИЙ'}\n`
		return { ...mode, val, safe }
	})

	log += `\n<span class="ok">✔ Обчислення завершено. Поріг α = ${alpha}</span>`

	/* ---- RENDER INTERMEDIATE ---- */
	const interR = document.getElementById('interResults')
	interR.innerHTML = `
    <div class="res-card"><div class="res-label">O = критер. оцінки</div><div class="res-val" style="font-size:0.85rem;line-height:1.8">${Ois.map(v => v.toFixed(2)).join('<br>')}</div></div>
    <div class="res-card"><div class="res-label">μ(O) = функції нал.</div><div class="res-val" style="font-size:0.85rem;line-height:1.8">${mus.map(v => v.toFixed(4)).join('<br>')}</div></div>
    <div class="res-card"><div class="res-label">M${selectedScenario}(S) – агрег. оцінка</div><div class="res-val">${Mg.toFixed(4)}</div></div>
    <div class="res-card"><div class="res-label">R${selectedScenario} – тренд</div><div class="res-val">${Rg.toFixed(3)}</div></div>
  `

	/* subordination check */
	const allM = [1, 2, 3, 4].map(s => ({ s, v: computeM(s, ws, mus) }))
	allM.sort((x, y) => x.s - y.s)
	document.getElementById('subRow').innerHTML =
		`<span style="color:var(--text-dim);font-size:0.7rem;letter-spacing:0.1em">СУБОРДИНАЦІЯ:</span> ` +
		allM
			.map(m => `<span class="sub-val">M${m.s}=${m.v.toFixed(3)}</span>`)
			.join('<span class="sub-op"> ≤ </span>')

	/* ---- MODES TABLE ---- */
	const tbody = document.getElementById('modesTbody')
	tbody.innerHTML = modeResults
		.map(
			(r, i) => `
    <tr>
      <td>${r.name}</td>
      <td>${r.k.toFixed(4)}</td>
      <td style="color:var(--accent2);font-weight:600">${r.val.toFixed(4)}</td>
      <td>${r.safe ? `<span class="status-safe">Безпечний</span>` : `<span class="status-unsafe">Небезпечний</span>`}</td>
    </tr>
  `,
		)
		.join('')

	/* ---- BAR CHART ---- */
	const barChart = document.getElementById('barChart')
	barChart.innerHTML = modeResults
		.map(
			(r, i) => `
    <div class="bar-row">
      <div class="bar-label">${r.name.split('–')[0]}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${(r.val * 100).toFixed(1)}%;background:${BAR_COLORS[i]}"></div>
      </div>
      <div class="bar-num">${r.val.toFixed(3)}</div>
    </div>
  `,
		)
		.join('')

	/* ---- LOG ---- */
	document.getElementById('stepsLog').innerHTML = log

	/* ---- SHOW ---- */
	const resultsEl = document.getElementById('results')
	resultsEl.classList.add('visible')
	resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/* ============================================================
   SNOW
============================================================ */
;(function initSnow() {
	const canvas = document.getElementById('snowCanvas')
	const ctx = canvas.getContext('2d')
	let W,
		H,
		flakes = []
	const N = 120

	function resize() {
		W = canvas.width = window.innerWidth
		H = canvas.height = window.innerHeight
	}
	window.addEventListener('resize', resize)
	resize()

	for (let i = 0; i < N; i++)
		flakes.push({
			x: Math.random() * W,
			y: Math.random() * H,
			r: Math.random() * 2.8 + 0.6,
			vx: (Math.random() - 0.5) * 0.5,
			vy: Math.random() * 0.8 + 0.3,
			o: Math.random() * 0.5 + 0.15,
		})

	function step() {
		ctx.clearRect(0, 0, W, H)
		flakes.forEach(f => {
			ctx.beginPath()
			ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
			ctx.fillStyle = `rgba(180,215,255,${f.o})`
			ctx.fill()
			f.x += f.vx
			f.y += f.vy
			if (f.y > H + 5) {
				f.y = -5
				f.x = Math.random() * W
			}
			if (f.x > W + 5) f.x = -5
			if (f.x < -5) f.x = W + 5
		})
		requestAnimationFrame(step)
	}
	step()
})()

/* ============================================================
   INIT
============================================================ */
renderCriteria()
