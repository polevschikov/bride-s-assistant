import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';

const children = [
  spawn(process.execPath, ['server.mjs'], { stdio: 'ignore' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0'], { stdio: 'ignore' }),
];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
const errors = [];
const notFound = [];

async function ready(url) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* server is starting */ }
    await sleep(250);
  }
  throw new Error(`Сервер не запустился: ${url}`);
}

function track(page) {
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() === 404) notFound.push(response.url()); });
}

async function startFlow(variant) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  track(page);
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.evaluate(value => { localStorage.clear(); localStorage.setItem('bride-variant', JSON.stringify(value)); }, variant);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Собрать мой план' }).click();
  return page;
}

async function chooseBranch(page, name) {
  if (await page.locator('.quiz-meta span').first().textContent() !== 'ВЫБОР СИТУАЦИИ') throw new Error('Вход не отделён от вопросов');
  await page.getByRole('button', { name }).click();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
}

async function question(page, title, number, total = 5) {
  await page.getByRole('heading', { name: title, exact: true }).waitFor();
  const actual = await page.locator('.quiz-meta span').first().textContent();
  const expected = `ВОПРОС ${number} ИЗ ${total}`;
  if (actual !== expected) throw new Error(`${title}: ожидалось «${expected}», получено «${actual}»`);
}

async function next(page, last = false) {
  await page.getByRole('button', { name: last ? 'Получить результат' : 'Продолжить', exact: true }).click();
}

async function choosePriorities(page) {
  for (const name of ['Кухня и атмосфера', 'Фотографии', 'Декор и цветы']) await page.getByRole('button', { name, exact: true }).click();
  if (!(await page.getByRole('button', { name: 'Музыка и ведущий', exact: true }).isDisabled())) throw new Error('Ограничение трёх приоритетов не работает');
}

async function projectId(page) {
  return page.evaluate(() => localStorage.getItem('bride-project'));
}

async function storedProject(page) {
  const id = await projectId(page);
  return (await page.request.get(`http://localhost:3001/api/projects/${id}`)).json();
}

async function openCheckout(page) {
  await page.getByRole('button', { name: 'Перейти в бесплатный планер' }).click();
  await page.getByRole('button', { name: 'Делегировать' }).first().click();
  await page.getByRole('button', { name: 'Оформить услугу' }).click();
}

async function dontKnowBase(page, total = 5) {
  await chooseBranch(page, /Не знаю, чего хочу/);
  await question(page, 'Сколько гостей?', 1, total);
  await page.getByLabel('Сколько гостей?').fill('60');
  await next(page);
  await question(page, 'Какой тип локации представляете?', 2, total);
  await page.getByRole('button', { name: /^Сад или терраса/ }).click();
  await next(page);
  await question(page, 'Какой стиль откликается?', 3, total);
  await page.getByRole('button', { name: /^Садовая естественность/ }).click();
  await next(page);
  await question(page, 'Что для вас важнее?', 4, total);
  await choosePriorities(page);
  await next(page);
  await question(page, 'Какой бюджет?', 5, total);
  await page.getByRole('slider').press('ArrowRight');
}

try {
  await Promise.all([ready('http://localhost:3000'), ready('http://localhost:3001/api/health')]);
  browser = await chromium.launch({ headless: true });
  const completed = [];

  // Ветка «Есть элементы»: свободный текст и фото без описания.
  let page = await startFlow('B');
  await chooseBranch(page, /Есть элементы, собрать воедино/);
  await question(page, 'Что уже выбрано?', 1);
  await page.getByLabel('Что уже выбрано?').fill('Площадка и фотограф');
  await next(page);
  await question(page, 'Опишите или загрузите фото', 2);
  await next(page);
  await page.getByRole('alert').waitFor();
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  await page.locator('input[type=file]').setInputFiles([1, 2, 3, 4].map(index => ({ name: `reference-${index}.png`, mimeType: 'image/png', buffer: pixel })));
  await page.getByText('Выбрано файлов: 3', { exact: true }).waitFor();
  await next(page);
  await question(page, 'Сколько гостей?', 3);
  await page.getByLabel('Сколько гостей?').fill('35');
  await next(page);
  await question(page, 'Какой остаток бюджета?', 4);
  await page.getByRole('slider').press('ArrowRight');
  await next(page);
  await question(page, 'Что ещё не выбрано?', 5);
  await page.getByLabel('Что ещё не выбрано?').fill('Декор, образы и координация');
  await next(page, true);
  await page.getByRole('heading', { level: 1, name: 'Собранная современная свадьба', exact: true }).waitFor();
  let stored = await storedProject(page);
  if (stored.answers.photos.files.length !== 3 || stored.answers.already_chosen !== 'Площадка и фотограф') throw new Error('Текст и метаданные фото не сохранились');
  await openCheckout(page);
  if (await page.getByLabel('Бюджет или диапазон').inputValue() !== '100000') throw new Error('Остаток бюджета не перенесён в бриф');
  await page.getByText('Референсов: 3', { exact: true }).waitFor();
  completed.push('has_elements');
  await page.close();

  // Ветка «Мало времени»: дата, гости, бюджет, готовое и критичные задачи.
  page = await startFlow('B');
  await chooseBranch(page, /Мало времени/);
  await question(page, 'Когда свадьба?', 1);
  await page.getByLabel('Когда свадьба?').fill('2027-08-15');
  await next(page);
  await question(page, 'Сколько гостей?', 2);
  await page.getByLabel('Сколько гостей?').fill('80');
  await next(page);
  await question(page, 'Какой бюджет?', 3);
  await page.getByRole('slider').press('ArrowRight');
  await next(page);
  await question(page, 'Что уже сделано?', 4);
  await page.getByLabel('Что уже сделано?').fill('Забронирована площадка');
  await next(page);
  await question(page, 'Что критично сделать сейчас?', 5);
  await choosePriorities(page);
  await next(page, true);
  await page.getByRole('heading', { name: 'Успеваете', exact: true }).waitFor();
  stored = await storedProject(page);
  if (stored.answers.critical_top3.length !== 3 || stored.answers.wedding_date !== '2027-08-15') throw new Error('Ответы ветки «Мало времени» сохранены неверно');
  await openCheckout(page);
  if (await page.getByLabel('Дата или ожидаемый период').inputValue() !== '2027-08-15') throw new Error('Дата свадьбы не перенесена в бриф');
  completed.push('no_time');
  await page.close();

  // Ветка «Не знаю, чего хочу»: пять вопросов в присланном порядке.
  page = await startFlow('B');
  await dontKnowBase(page);
  await next(page, true);
  await page.getByRole('heading', { name: 'Направление собрано', exact: true }).waitFor();
  stored = await storedProject(page);
  if (stored.answers.branch !== 'dont_know' || stored.answers.style !== 'garden' || stored.answers.priorities_top3.length !== 3) throw new Error('Ветка «Не знаю, чего хочу» сохранена неверно');
  completed.push('dont_know');
  await page.close();

  // Вариант A сохраняет три дополнительных вопроса после пяти основных.
  page = await startFlow('A');
  await dontKnowBase(page, 8);
  await next(page);
  await question(page, 'Нужна ли выездная церемония?', 6, 8);
  await page.locator('.option').first().click();
  await next(page);
  await question(page, 'В каком сезоне праздник?', 7, 8);
  await page.locator('.option').first().click();
  await next(page);
  await question(page, 'Как удобнее продолжить?', 8, 8);
  await page.locator('.option').first().click();
  await next(page, true);
  await page.getByText('ВАШ БЕСПЛАТНЫЙ РЕЗУЛЬТАТ').waitFor();
  stored = await storedProject(page);
  if (!stored.answers.ceremony || !stored.answers.season || !stored.answers.contactLater) throw new Error('Дополнительные ответы варианта A не сохранились');

  // Приглашение партнёра и карта компромиссов.
  const id = await projectId(page);
  const invite = await (await page.request.post('http://localhost:3001/api/partners', { data: { projectId: id } })).json();
  await page.goto(invite.url.replace('localhost:3001', 'localhost:3000'));
  for (let index = 0; index < 7; index += 1) {
    if (index === 1) await page.getByRole('slider').press('ArrowRight');
    else await page.locator('.option').first().click();
    await page.getByRole('button', { name: 'Дальше' }).click();
  }
  await page.getByText('КАРТА КОМПРОМИССОВ').waitFor();

  // Отмена sandbox-платежа подтверждается сервером.
  const order = await (await page.request.post('http://localhost:3001/api/orders', { data: { projectId: id, service: 'consult', brief: {}, contact: { phone: '+79000000000' } } })).json();
  await page.request.post(`http://localhost:3001/api/orders/${order.id}/pay`);
  const html = await (await page.request.get(`http://localhost:3001/sandbox/checkout/${order.id}`)).text();
  const match = html.match(/href="([^"]*status=canceled[^"]*)"/);
  if (!match) throw new Error('Ссылка отмены sandbox-платежа не найдена');
  await page.request.get(`http://localhost:3001${match[1].replaceAll('&amp;', '&')}`);
  const cancelled = await (await page.request.get(`http://localhost:3001/api/orders/${order.id}`)).json();
  if (cancelled.status !== 'cancelled') throw new Error('Отмена платежа не сохранена');
  if (errors.length || notFound.length) throw new Error(`Ошибки браузера: ${JSON.stringify({ errors, notFound })}`);

  console.log(JSON.stringify({ ok: true, variantB: completed, variantA: 'отдельный вход + 8 вопросов', photos: '3 metadata files, без описания', maxSelect: 3, partner: 'compromise map', cancel: 'cancelled', consoleErrors: errors, notFound }, null, 2));
  await page.close();
} finally {
  if (browser) await browser.close();
  for (const child of children) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
}
