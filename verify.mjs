import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';

fs.mkdirSync('test-output', { recursive: true });
fs.rmSync('test-output/verify.db', { force: true });
const testEnv = { ...process.env, DATABASE_PATH: 'test-output/verify.db', MEDIA_PATH: 'test-output/verify-uploads' };
const children = [
  spawn(process.execPath, ['server.mjs'], { cwd: process.cwd(), stdio: 'inherit', env: testEnv }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0'], { cwd: process.cwd(), stdio: 'inherit', env: testEnv }),
];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;

async function ready(url) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* server is starting */ }
    await sleep(250);
  }
  throw new Error(`Сервер не запустился: ${url}`);
}

async function question(page, title, number) {
  await page.getByRole('heading', { name: title, exact: true }).waitFor();
  const actual = await page.locator('.quiz-meta span').first().textContent();
  const expected = `ВОПРОС ${number} ИЗ 5`;
  if (actual !== expected) throw new Error(`${title}: ожидалось «${expected}», получено «${actual}»`);
}

async function next(page, last = false) {
  await page.getByRole('button', { name: last ? 'Получить результат' : 'Продолжить', exact: true }).click();
}

try {
  await Promise.all([ready('http://localhost:3000'), ready('http://localhost:3001/api/health')]);
  fs.mkdirSync('test-output', { recursive: true });
  browser = await chromium.launch({ headless: true });
  const errors = [];
  const notFound = [];
  const track = page => {
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() === 404) notFound.push(response.url()); });
  };

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  track(page);
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('bride-variant', '"B"'); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.screenshot({ path: 'test-output/home-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Собрать мой план' }).click();

  await page.getByRole('heading', { name: 'Выберите вашу ситуацию', exact: true }).waitFor();
  if (await page.locator('.quiz-meta span').first().textContent() !== 'ВЫБОР СИТУАЦИИ') throw new Error('Вход не отделён от пяти вопросов');
  await page.getByRole('button', { name: /Есть бюджет/ }).click();
  await next(page);

  await question(page, 'Какой бюджет?', 1);
  await page.getByRole('slider').press('ArrowRight');
  await next(page);
  await question(page, 'Сколько гостей?', 2);
  await page.getByLabel('Сколько гостей?').fill('50');
  await next(page);
  await question(page, 'Какой тип локации ближе?', 3);
  if (await page.locator('.visual-option').count() !== 6) throw new Error('В локациях должно быть шесть визуальных вариантов');
  await page.screenshot({ path: 'test-output/locations-desktop.png', fullPage: true });
  await page.getByRole('button', { name: /^Лофт/ }).click();
  await next(page);
  await question(page, 'Какой стиль вам близок?', 4);
  if (await page.locator('.visual-option').count() !== 3) throw new Error('В стилях должно быть три визуальных варианта');
  await page.getByRole('button', { name: /^Тихая современность/ }).click();
  await next(page);
  await question(page, 'На что потратить больше?', 5);
  for (const name of ['Кухня и атмосфера', 'Фотографии', 'Декор и цветы']) await page.getByRole('button', { name, exact: true }).click();
  if (!(await page.getByRole('button', { name: 'Музыка и ведущий', exact: true }).isDisabled())) throw new Error('Четвёртый приоритет не заблокирован');
  if (await page.locator('.option.selected').count() !== 3) throw new Error('Выбрано не три приоритета');
  await next(page, true);

  await page.getByText('ВАШ БЕСПЛАТНЫЙ РЕЗУЛЬТАТ').waitFor();
  await page.getByRole('heading', { name: 'Пока не укладываетесь', exact: true }).waitFor();
  await page.screenshot({ path: 'test-output/result.png', fullPage: true });
  await page.getByRole('button', { name: 'Перейти в бесплатный планер' }).click();
  await page.getByRole('button', { name: 'Отметить выполненной' }).first().click();
  await page.getByRole('button', { name: 'Делегировать' }).first().click();
  await page.getByRole('button', { name: 'Оформить услугу' }).click();
  if (await page.getByLabel('Количество гостей').inputValue() !== '50') throw new Error('Гости не перенесены в бриф');
  if (await page.getByLabel('Бюджет или диапазон').inputValue() !== '250000') throw new Error('Новое поле бюджета не перенесено в бриф');
  await page.getByLabel('Дата или ожидаемый период').fill('Август 2027');
  await page.getByLabel('Пожелания и ограничения').fill('Светлое пространство, без выездной церемонии');
  await page.getByLabel('Телефон').fill('+7 900 000-00-00');
  await page.screenshot({ path: 'test-output/checkout.png', fullPage: true });
  await page.getByRole('button', { name: /Перейти к тестовой оплате/ }).click();
  await page.getByRole('link', { name: 'Подтвердить тестовый платёж' }).click();
  await page.getByText('Тестовая оплата подтверждена').waitFor({ timeout: 10000 });
  await page.screenshot({ path: 'test-output/order-paid.png', fullPage: true });

  const projectId = await page.evaluate(() => localStorage.getItem('bride-project'));
  const stored = await (await page.request.get(`http://localhost:3001/api/projects/${projectId}`)).json();
  if (!stored.tasks.some(task => task.status === 'done')) throw new Error('Задача не сохранена');
  if (stored.answers.branch !== 'has_budget' || stored.answers.guests !== 50 || stored.answers.location_type !== 'loft' || stored.answers.style !== 'modern') throw new Error('Ответы ветки сохранены неверно');
  if (stored.answers.spend_top3.length !== 3) throw new Error('Топ-3 сохранён неверно');

  const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
  track(mobile);
  await mobile.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await mobile.evaluate(() => { localStorage.clear(); localStorage.setItem('bride-variant', '"B"'); });
  await mobile.reload({ waitUntil: 'networkidle' });
  await mobile.screenshot({ path: 'test-output/home-mobile.png', fullPage: true });
  await mobile.getByRole('button', { name: 'Собрать мой план' }).click();
  await mobile.getByRole('button', { name: /Есть бюджет/ }).click();
  await next(mobile);
  await mobile.getByRole('slider').press('ArrowRight');
  await next(mobile);
  await mobile.getByLabel('Сколько гостей?').fill('40');
  await next(mobile);
  await question(mobile, 'Какой тип локации ближе?', 3);
  await mobile.screenshot({ path: 'test-output/locations-mobile.png', fullPage: true });
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) throw new Error('Горизонтальная прокрутка на мобильном экране локаций');
  if (await mobile.locator('.visual-option').count() !== 6) throw new Error('Мобильные карточки локаций не отобразились');

  if (errors.length || notFound.length) throw new Error(`Ошибки браузера: ${JSON.stringify({ errors, notFound })}`);
  console.log(JSON.stringify({ ok: true, variant: 'B', entry: 'separate', contentQuestions: 5, branch: 'has_budget', payment: 'paid', database: true, mobileOverflow: overflow, consoleErrors: errors, notFound }, null, 2));
} finally {
  if (browser) await browser.close();
  for (const child of children) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
}
