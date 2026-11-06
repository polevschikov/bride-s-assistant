import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const output = 'test-output';
fs.mkdirSync(output, { recursive: true });
fs.rmSync(`${output}/verify-workspace.db`, { force: true });
fs.rmSync(`${output}/verify-workspace-uploads`, { recursive: true, force: true });
const env = {
  ...process.env,
  DATABASE_PATH: `${output}/verify-workspace.db`,
  MEDIA_PATH: `${output}/verify-workspace-uploads`,
  ADMIN_ACCESS_CODE: 'workspace-admin',
};
const children = [
  spawn(process.execPath, ['server.mjs'], { stdio: 'ignore', env }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0'], { stdio: 'ignore', env }),
];
const apiRoot = 'http://localhost:3001';
const siteRoot = 'http://localhost:3000';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [];
const notFound = [];
const completed = [];
let browser;

async function ready(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* server is starting */ }
    await sleep(250);
  }
  throw new Error(`Сервер не запустился: ${url}`);
}

async function request(path, { token, method = 'GET', body, expected = 200 } = {}) {
  const response = await fetch(`${apiRoot}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}

function track(page) {
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() === 404) notFound.push(response.url()); });
}

async function checkOverflow(page, name) {
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll('body *')].map(element => {
      const rect = element.getBoundingClientRect();
      return { tag: element.tagName, className: String(element.className), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) };
    }).filter(item => item.width > 0 && (item.right > innerWidth + 1 || item.left < -1)).slice(0, 20),
  }));
  assert.ok(dimensions.scroll <= dimensions.width, `${name}: горизонтальное переполнение ${JSON.stringify(dimensions)}`);
}

try {
  await Promise.all([ready(siteRoot), ready(`${apiRoot}/api/health`)]);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  track(page);

  // Проект создаётся до входа и затем привязывается к демонстрационному клиенту.
  const project = await request('/api/projects', { method: 'POST', body: { variant: 'B' } });
  await request(`/api/projects/${project.id}`, { method: 'PUT', body: { result: { title: 'Направление собрано', style: 'Садовая естественность' } } });
  await page.goto(`${siteRoot}/?account=1`, { waitUntil: 'networkidle' });
  await page.evaluate(id => { localStorage.clear(); localStorage.setItem('bride-project', id); }, project.id);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Яндекс', exact: true }).click();
  await page.getByLabel('Ваше имя').fill('Анна');
  await page.getByLabel('Почта', { exact: true }).fill('anna.workspace@example.ru');
  await page.getByRole('button', { name: 'Войти в демо-кабинет' }).click();
  await page.getByRole('heading', { name: /Анна, продолжим/ }).waitFor();
  const clientToken = await page.evaluate(() => localStorage.getItem('bride-client-token'));
  assert.ok(clientToken);
  let account = await request('/api/account', { token: clientToken });
  assert.equal(account.projects[0].id, project.id);
  assert.equal(account.identities[0].provider, 'yandex');
  completed.push('демо-вход и привязка проекта');

  await page.locator('.account-sidebar nav').getByRole('button', { name: 'Профиль', exact: true }).click();
  await page.getByLabel('Имя', { exact: true }).fill('Анна Тест');
  await page.getByLabel('Телефон', { exact: true }).fill('+7 900 123-45-67');
  await page.getByRole('button', { name: 'Сохранить профиль' }).click();
  await page.getByText('Профиль сохранён', { exact: true }).waitFor();
  account = await request('/api/account', { token: clientToken });
  assert.equal(account.client.name, 'Анна Тест');
  assert.equal(account.client.phone, '+7 900 123-45-67');

  await page.locator('.account-sidebar nav').getByRole('button', { name: 'Планер', exact: true }).click();
  await page.locator('.account-task-list .account-task').first().click();
  await sleep(300);
  const changedProject = await request(`/api/projects/${project.id}`);
  assert.equal(changedProject.tasks[0].status, 'done');
  await page.locator('.account-sidebar nav').getByRole('button', { name: 'Мой проект', exact: true }).click();
  await page.screenshot({ path: `${output}/workspace-account.png`, fullPage: true });
  completed.push('профиль и задачи кабинета');

  const order = await request('/api/orders', {
    method: 'POST',
    body: { projectId: project.id, service: 'consult', brief: { date: 'август 2027', guests: 60, budget: 500000, notes: 'Проверка заявки' }, contact: { name: 'Анна Тест', phone: '+79001234567', messenger: 'Telegram' } },
  });

  // Вход администратора выполняется через реальную форму.
  await page.goto(`${siteRoot}/?admin=1`, { waitUntil: 'networkidle' });
  await page.getByLabel('Код администратора').fill('workspace-admin');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('heading', { name: 'Сегодня в проекте' }).waitFor();
  const adminToken = await page.evaluate(() => localStorage.getItem('bride-admin-token'));
  assert.ok(adminToken);
  const overview = await request('/api/admin/overview', { token: adminToken });
  assert.equal(overview.clients, 1);
  assert.equal(overview.orders, 1);
  await page.screenshot({ path: `${output}/workspace-admin.png`, fullPage: true });

  await page.locator('.admin-sidebar nav').getByRole('button', { name: 'Заявки', exact: true }).click();
  await page.getByLabel('Поиск заявок').fill('Анна');
  await page.getByRole('button', { name: `Открыть заказ ${order.id}`, exact: true }).waitFor();
  await page.getByRole('button', { name: `Открыть заказ ${order.id}`, exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('dialog').locator('select').first().selectOption('in_progress');
  await page.getByPlaceholder('Добавить комментарий').fill('Связались с клиентом в тестовом сценарии');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await page.getByText('Связались с клиентом в тестовом сценарии', { exact: true }).waitFor();
  let orderDetails;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    orderDetails = await request(`/api/admin/orders/${order.id}`, { token: adminToken });
    if (orderDetails.notes.length === 1) break;
    await sleep(200);
  }
  assert.equal(orderDetails.order.status, 'in_progress');
  assert.equal(orderDetails.notes.length, 1);
  assert.ok(orderDetails.history.some(item => item.status === 'in_progress'));
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  completed.push('заявки, статусы, история и комментарии');

  const clients = await request('/api/admin/clients', { token: adminToken });
  const clientId = clients[0].id;
  await request(`/api/admin/clients/${clientId}/wallet`, { token: adminToken, method: 'POST', body: { amount: 500, reason: 'Бонус за тест' } });
  await request(`/api/admin/clients/${clientId}/wallet`, { token: adminToken, method: 'POST', body: { amount: -200, reason: 'Тестовое списание' } });
  await request(`/api/admin/clients/${clientId}/wallet`, { token: adminToken, method: 'POST', body: { amount: -1000, reason: 'Запрещённое списание' }, expected: 409 });
  account = await request('/api/account', { token: clientToken });
  assert.equal(account.balance, 300);
  assert.equal(account.wallet.length, 2);
  completed.push('бонусы и неотрицательный баланс');

  // Старая заявка сохраняет название и сумму после редактирования каталога.
  const services = await request('/api/admin/services', { token: adminToken });
  const consult = services.find(item => item.id === 'consult');
  await request(`/api/admin/services/${consult.id}`, { token: adminToken, method: 'PUT', body: { ...consult, name: 'Временное название', price: 999999 } });
  const immutableOrder = await request(`/api/orders/${order.id}`);
  assert.equal(immutableOrder.service, order.service);
  assert.equal(immutableOrder.amount, order.amount);
  await request(`/api/admin/services/${consult.id}`, { token: adminToken, method: 'PUT', body: consult });
  const createdService = await request('/api/admin/services', { token: adminToken, method: 'POST', body: { name: 'Проверочная услуга', price: 1500, result: 'Временный результат', includes: ['Пункт'], published: true, sort_order: 999 } });
  let publicConfig = await request('/api/public/config');
  assert.ok(publicConfig.services.some(item => item.id === createdService.id));
  await request(`/api/admin/services/${createdService.id}`, { token: adminToken, method: 'PUT', body: { name: 'Проверочная услуга изменена', price: 1800, result: 'Изменено', includes: ['Пункт'], published: false, sort_order: 999 } });
  publicConfig = await request('/api/public/config');
  assert.ok(!publicConfig.services.some(item => item.id === createdService.id));
  completed.push('услуги, скрытие и неизменность старого заказа');

  // Черновик главной не виден до публикации; после проверки контент возвращается.
  const pages = await request('/api/admin/pages', { token: adminToken });
  const home = pages.find(item => item.id === 'home');
  const originalHomeTitle = home.title;
  const originalBlocks = structuredClone(home.draft_blocks);
  const originalHeroTitle = originalBlocks.find(block => block.type === 'hero').title;
  const draftBlocks = structuredClone(originalBlocks);
  draftBlocks.find(block => block.type === 'hero').title = 'Черновик не опубликован';
  await request('/api/admin/pages/home', { token: adminToken, method: 'PUT', body: { title: originalHomeTitle, blocks: draftBlocks } });
  await page.goto(`${siteRoot}/?page=home&preview=1`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Черновик не опубликован', exact: true }).waitFor();
  await page.getByText('Предпросмотр черновика · изменения видны только администратору', { exact: true }).waitFor();
  publicConfig = await request('/api/public/config');
  assert.equal(publicConfig.pages.home.blocks.find(block => block.type === 'hero').title, originalHeroTitle);
  draftBlocks.find(block => block.type === 'hero').title = 'Проверка публикации';
  await request('/api/admin/pages/home', { token: adminToken, method: 'PUT', body: { title: originalHomeTitle, blocks: draftBlocks } });
  await request('/api/admin/pages/home/publish', { token: adminToken, method: 'POST', body: {} });
  publicConfig = await request('/api/public/config');
  assert.equal(publicConfig.pages.home.blocks.find(block => block.type === 'hero').title, 'Проверка публикации');
  await request('/api/admin/pages/home', { token: adminToken, method: 'PUT', body: { title: originalHomeTitle, blocks: originalBlocks } });
  await request('/api/admin/pages/home/publish', { token: adminToken, method: 'POST', body: {} });

  const newPage = await request('/api/admin/pages', { token: adminToken, method: 'POST', body: { title: 'Проверочная страница', slug: 'workspace-about' } });
  const cmsBlocks = [{ id: 'about-text', type: 'text', visible: true, eyebrow: 'О СЕРВИСЕ', title: 'Страница из CMS открывается', text: 'Этот блок создан и опубликован автоматической проверкой.' }];
  await request(`/api/admin/pages/${newPage.id}`, { token: adminToken, method: 'PUT', body: { title: 'Проверочная страница', blocks: cmsBlocks } });
  await request(`/api/admin/pages/${newPage.id}/publish`, { token: adminToken, method: 'POST', body: {} });
  await page.goto(`${siteRoot}/?page=workspace-about`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Страница из CMS открывается', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/workspace-cms-page.png`, fullPage: true });
  await request(`/api/admin/pages/${newPage.id}`, { token: adminToken, method: 'DELETE' });
  completed.push('черновики, публикации и публичные CMS-страницы');

  // Публикация квиза меняет только новую конфигурацию, затем исходный текст восстанавливается.
  const quiz = await request('/api/admin/quiz', { token: adminToken });
  const originalQuiz = structuredClone(quiz.draft_data);
  const styleQuestion = quiz.draft_data.branches.dont_know.find(item => item.id === 'style');
  const originalStyleTitle = styleQuestion.title;
  styleQuestion.title = 'Черновик вопроса';
  await request('/api/admin/quiz', { token: adminToken, method: 'PUT', body: { name: quiz.name, data: quiz.draft_data } });
  publicConfig = await request('/api/public/config');
  assert.equal(publicConfig.quiz.branches.dont_know.find(item => item.id === 'style').title, originalStyleTitle);
  styleQuestion.title = 'Проверка вопроса';
  await request('/api/admin/quiz', { token: adminToken, method: 'PUT', body: { name: quiz.name, data: quiz.draft_data } });
  await request('/api/admin/quiz/publish', { token: adminToken, method: 'POST', body: {} });
  publicConfig = await request('/api/public/config');
  assert.equal(publicConfig.quiz.branches.dont_know.find(item => item.id === 'style').title, 'Проверка вопроса');
  await request('/api/admin/quiz', { token: adminToken, method: 'PUT', body: { name: quiz.name, data: originalQuiz } });
  await request('/api/admin/quiz/publish', { token: adminToken, method: 'POST', body: {} });

  const planner = await request('/api/admin/planner', { token: adminToken });
  const originalPlanner = structuredClone(planner.draft_data);
  const originalTaskTitle = planner.draft_data[0].title;
  planner.draft_data[0].title = 'Проверочная задача шаблона';
  await request('/api/admin/planner', { token: adminToken, method: 'PUT', body: { name: planner.name, data: planner.draft_data } });
  await request('/api/admin/planner/publish', { token: adminToken, method: 'POST', body: {} });
  const newProject = await request('/api/projects', { method: 'POST', body: { variant: 'B' } });
  assert.equal(newProject.tasks[0].title, 'Проверочная задача шаблона');
  assert.equal((await request(`/api/projects/${project.id}`)).tasks[0].title, originalTaskTitle);
  await request('/api/admin/planner', { token: adminToken, method: 'PUT', body: { name: planner.name, data: originalPlanner } });
  await request('/api/admin/planner/publish', { token: adminToken, method: 'POST', body: {} });
  completed.push('публикации квиза и шаблона планера');

  // Загрузка и удаление изображения выполняются через интерфейс медиабиблиотеки.
  await page.goto(`${siteRoot}/?admin=1`, { waitUntil: 'networkidle' });
  await page.locator('.admin-sidebar nav').getByRole('button', { name: 'Медиа', exact: true }).click();
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  await page.locator('input[type=file]').setInputFiles({ name: 'workspace-pixel.png', mimeType: 'image/png', buffer: pixel });
  await page.getByLabel('Описание для доступности').fill('Тестовый прозрачный пиксель');
  await page.getByRole('button', { name: 'Загрузить', exact: true }).click();
  await page.getByText('Изображение загружено', { exact: true }).waitFor();
  let media = await request('/api/admin/media', { token: adminToken });
  assert.equal(media.length, 1);
  const uploaded = await fetch(new URL(media[0].url, apiRoot));
  assert.equal(uploaded.status, 200);
  assert.equal(uploaded.headers.get('content-type'), 'image/png');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Удалить workspace-pixel.png', exact: true }).click();
  await page.getByRole('button', { name: 'Удалить workspace-pixel.png', exact: true }).waitFor({ state: 'detached' });
  media = await request('/api/admin/media', { token: adminToken });
  assert.equal(media.length, 0);
  completed.push('медиабиблиотека и файловое хранилище');

  const settings = (await request('/api/admin/settings', { token: adminToken })).settings;
  await request('/api/admin/settings', { token: adminToken, method: 'PUT', body: { ...settings, contact_telegram: 'https://t.me/workspace_example', payment_enabled: 'false' } });
  publicConfig = await request('/api/public/config');
  assert.equal(publicConfig.settings.contact_telegram, 'https://t.me/workspace_example');
  await request(`/api/orders/${order.id}/pay`, { method: 'POST', body: {}, expected: 409 });
  await request('/api/admin/settings', { token: adminToken, method: 'PUT', body: settings });
  completed.push('контакты и управление sandbox-оплатой');

  await page.goto(siteRoot, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: originalHeroTitle, exact: true }).waitFor();
  await page.getByRole('link', { name: 'Telegram', exact: true }).waitFor({ state: 'detached' });
  await checkOverflow(page, 'Главная desktop');
  await page.screenshot({ path: `${output}/workspace-home.png`, fullPage: true });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  track(mobile);
  await mobile.goto(siteRoot, { waitUntil: 'networkidle' });
  await checkOverflow(mobile, 'Главная mobile');
  await mobile.screenshot({ path: `${output}/workspace-home-mobile.png`, fullPage: true });
  await mobile.goto(`${siteRoot}/?account=1`, { waitUntil: 'networkidle' });
  await mobile.evaluate(token => localStorage.setItem('bride-client-token', token), clientToken);
  await mobile.reload({ waitUntil: 'networkidle' });
  await mobile.getByRole('heading', { name: /Анна Тест, продолжим/ }).waitFor();
  await checkOverflow(mobile, 'Кабинет mobile');
  await mobile.screenshot({ path: `${output}/workspace-account-mobile.png`, fullPage: true });
  await mobile.close();

  assert.deepEqual(errors, [], `Ошибки браузера: ${JSON.stringify(errors)}`);
  assert.deepEqual(notFound, [], `Ответы 404: ${JSON.stringify(notFound)}`);
  console.log(JSON.stringify({ ok: true, completed, consoleErrors: errors, notFound, screenshots: 6 }, null, 2));
  await page.close();
} finally {
  if (browser) await browser.close();
  for (const child of children) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
}
