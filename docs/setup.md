# Запуск, проверки и деплой

## Локальный запуск с нуля

Требования: Node.js 22 рекомендуется (на стенде используется 22.x), npm и Chromium для Playwright. `engines` в `package.json` не задан.

```bash
git clone https://github.com/polevschikov/bride-s-assistant.git
cd bride-s-assistant
npm ci
cp .env.example .env       # Windows: copy .env.example .env
```

В `.env` заменить `SANDBOX_SECRET` и `ADMIN_ACCESS_CODE` на разные случайные строки. Для локального запуска внешние S3 и ЮKassa не нужны.

```bash
npm run dev
```

- Сайт и Vite: `http://localhost:3000`.
- API и sandbox checkout: `http://localhost:3001`.
- Админка: `http://localhost:3000/?admin=1`.
- Кабинет: `http://localhost:3000/?account=1`.

`npm run dev` запускает API и Vite через `dev.mjs`. Остановка — `Ctrl+C`; скрипт завершает дочерние процессы.

Production-режим локально:

```bash
npm run build
npm start
```

Express раздаст `dist` и API на `http://localhost:3001`.

## Проверки

```bash
node --check server.mjs
node --check content-seed.mjs
node --check storage.mjs
npx playwright install chromium
npm run build
node verify.mjs
node verify-extra.mjs
node verify-workspace.mjs
npm audit --omit=dev
```

E2E-скрипты запускать **последовательно**: все используют порты 3000/3001. Перед запуском освободить эти порты. Скрипты создают отдельные БД в `test-output`, не используют рабочую `wedding.db` и останавливают свои процессы в `finally`.

- `verify.mjs` — ветка «Есть бюджет», планер, оплата, SQLite и mobile overflow.
- `verify-extra.mjs` — остальные ветки, вариант A, фото-метаданные, партнёр и отмена платежа.
- `verify-workspace.mjs` — админка, кабинет, заявки, бонусы, услуги, CMS/preview, планер, медиа, настройки и мобильные экраны.

`npm run lint` существует, но на момент передачи не является зелёной проверкой из-за `no-explicit-any` и ошибок шаблонных компонентов. Не выдавать lint за пройденный. Полный `npm audit` на момент релиза показывал 7 moderate в dev-цепочке; production-аудит был чистым.

## Ручной деплой на REG.RU

GitHub CI и защита main включены; результаты запусков — tasks/github-ci-protection.md. Автодеплоя нет. Публикация — отдельное разрешённое действие для точного проверенного commit; процесс и версии описаны в workflow.md и releases.md. Команды ниже — справочник будущей разрешённой выкладки, не текущее поручение менять сервер.

- Сервер: `root@193.227.241.70`.
- Код: `/opt/bride-assistant`.
- Служба: `bride-assistant.service`.
- Nginx site: `/etc/nginx/sites-enabled/bride-assistant`.
- База: `/var/lib/bride-assistant/wedding.db`.
- Медиа: `/var/lib/bride-assistant/uploads`.
- Backups: `/var/lib/bride-assistant/backups`.

Перед миграцией схемы или данных:

```bash
ssh root@193.227.241.70
install -d -o www-data -g www-data /var/lib/bride-assistant/backups
cd /opt/bride-assistant
BACKUP=/var/lib/bride-assistant/backups/wedding-$(date +%Y%m%d-%H%M%S).db
node --input-type=module -e "import Database from 'better-sqlite3'; const db=new Database('/var/lib/bride-assistant/wedding.db'); await db.backup(process.argv[1]); console.log(process.argv[1]);" "$BACKUP"
chown www-data:www-data "$BACKUP"
```

Обновление:

```bash
cd /opt/bride-assistant
: "${RELEASE_COMMIT:?Укажите точный проверенный commit разрешённого выпуска}"
git fetch origin
git switch --detach "$RELEASE_COMMIT"
npm ci
npm run build
nginx -t
systemctl daemon-reload
systemctl restart bride-assistant
systemctl reload nginx
systemctl is-active bride-assistant
curl -fsS http://127.0.0.1:3001/api/health
curl -fsSI http://127.0.0.1/
```

После обновления проверить главную, админку и кабинет по публичному IP. Не запускать E2E на production: они создают и изменяют данные. Для production нужен отдельный неразрушающий smoke-сценарий.

Nginx должен содержать `client_max_body_size 14m` и proxy на `127.0.0.1:3001`.

## Переменные окружения

Значения не хранить в Git. На стенде переменные находятся в `/etc/systemd/system/bride-assistant.service` и `/etc/systemd/system/bride-assistant.service.d/workspace.conf`.

| Имя | Назначение |
|---|---|
| `NODE_ENV` | `production` включает раздачу `dist` через Express |
| `PORT` | Порт Express, на стенде `3001` |
| `DATABASE_PATH` | Путь к SQLite; на стенде `/var/lib/bride-assistant/wedding.db` |
| `SANDBOX_SECRET` | HMAC-SHA256 подпись sandbox-подтверждений |
| `ADMIN_ACCESS_CODE` | Код единственного администратора |
| `MEDIA_PATH` | Каталог локальной медиабиблиотеки |
| `S3_ENDPOINT` | Endpoint S3-совместимого хранилища |
| `S3_BUCKET` | Bucket для изображений |
| `S3_ACCESS_KEY_ID` | Access key S3 |
| `S3_SECRET_ACCESS_KEY` | Secret key S3 |
| `S3_REGION` | Регион SDK; по умолчанию `ru-central1` |
| `S3_FORCE_PATH_STYLE` | Path-style обращения; по умолчанию включено, `false` отключает |
| `S3_PUBLIC_URL` | Необязательная публичная база URL файлов; без неё URL строится из endpoint/bucket |
| `YOOKASSA_SHOP_ID` | ID магазина ЮKassa; сейчас не установлен |
| `YOOKASSA_SECRET_KEY` | Секрет магазина ЮKassa; сейчас не установлен |

S3 активируется только при заполненных `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Иначе используется `MEDIA_PATH`.
