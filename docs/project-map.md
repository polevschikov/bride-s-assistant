# Карта проекта

Корень репозитория — `app/`. Интеграционная ветка — `main`; задачи выполняются в отдельных ветках по workflow.md.

## Память функций: адресный вход

Срез локального кода от 9ba0440, 08.11.2026; проверки текущей настройки — docs/tasks/autonomous-workflow.md. Таблица — навигация по коду, не гарантия неизменного интерфейса или текущего PASS. При расхождении агент самостоятельно исследует затронутую функцию и обновляет запись с commit/окружением. Не создавать вторую параллельную карту; читать только нужные строки и связанные разделы.

| Функция | Код | API / данные | Проверка |
|---|---|---|---|
| Главная, публичный контент | src/SiteHome.tsx, src/App.tsx | /api/public/config; опубликованные pages/settings | verify-workspace.mjs: CMS и публичные страницы |
| Квиз A/B, результат | src/App.tsx, src/data.ts, kviz-variant-b-tree.md | /api/projects; projects.answers/result | verify.mjs, verify-extra.mjs: ветки, вопросы, сохранение |
| Планер | src/App.tsx, src/Account.tsx | /api/projects; projects.tasks, шаблон в CMS | все три verify-набора по своим сценариям |
| Партнёр и компромиссы | src/App.tsx, server.mjs | /api/partners; partners | verify-extra.mjs |
| Заказ и тестовая оплата | src/App.tsx, server.mjs | /api/orders, sandbox/payment-маршруты; orders/payments/events | verify.mjs: paid; verify-extra.mjs: cancelled |
| Кабинет и демо-вход | src/Account.tsx, server.mjs | /api/auth/demo, /api/account; clients/client_sessions | verify-workspace.mjs |
| Заявки/клиенты/бонусы | src/admin/OrdersClients.tsx, src/admin/api.ts | /api/admin/*; clients/orders/wallet_transactions | verify-workspace.mjs |
| CMS и медиа | src/admin/Editors.tsx, src/admin/Admin.tsx, storage.mjs | /api/admin/*; pages/quiz/planner и uploads | verify-workspace.mjs |
| Запуск, SQLite и сохранность | dev.mjs, server.mjs | /api/health; DATABASE_PATH, WAL | tests/api.test.mjs; сборка npm run build |

Новые полезные знания добавлять в соответствующий раздел по ходу задачи: условие/ревизия, факт, ссылка на проверку, ограничения. Временные ID, токены, секреты и координаты кликов не сохранять. Данные задачи и неудачные гипотезы — в docs/tasks/, а не в общей карте.

## Структура

```text
app/
├── server.mjs                 Express API, SQLite-схема, auth, платежи, CMS, production static
├── content-seed.mjs           Начальные услуги, квиз, блоки главной, задачи и настройки
├── storage.mjs                Локальное/S3-хранение изображений
├── dev.mjs                    Одновременный запуск API и Vite, остановка дочерних процессов
├── verify.mjs                 E2E: ветка «Есть бюджет», оплата, мобильная проверка
├── verify-extra.mjs           E2E: остальные ветки, партнёр, отмена платежа
├── verify-workspace.mjs       E2E/API: админка, CMS, медиа, клиент и кошелёк
├── package.json               npm-скрипты и зависимости
├── package-lock.json          Зафиксированное дерево зависимостей
├── vite.config.ts             Порт 3000, proxy на API 3001, alias `@`
├── tsconfig*.json             TypeScript-конфигурация приложения и Vite
├── eslint.config.js           ESLint; сейчас проверка не зелёная
├── tailwind.config.js         Tailwind-тема исходного шаблона
├── postcss.config.js          PostCSS
├── components.json            Настройки shadcn/ui
├── index.html                 HTML-вход Vite
├── .env.example               Имена переменных без реальных секретов
├── .gitignore                 Исключения зависимостей, сборки, БД, секретов и временных файлов
├── README.md                  Общее описание и краткий запуск
├── info.md                    Устаревшая заметка шаблона; кандидат на удаление
├── kviz-variant-b-tree.md     Исходная схема квиза варианта B
├── docs/                      План, статус и документация передачи
├── public/
│   └── illustrations/         16 рабочих WebP-иллюстраций интерфейса
└── src/
    ├── main.tsx               React-вход, BrowserRouter, локальные шрифты и CSS
    ├── App.tsx                Публичные сценарии и переключение admin/account/CMS
    ├── SiteHome.tsx           Рендер опубликованных CMS-блоков и контактов
    ├── Account.tsx            Демонстрационный кабинет клиента
    ├── data.ts                Статический fallback квиза, услуг и вопросов партнёра
    ├── Illustration.tsx       React-обёртки иллюстраций
    ├── index.css              Основная визуальная система публичного сайта
    ├── workspace.css          Стили админки, кабинета и CMS-блоков
    ├── App.css                Используется только неиспользуемым шаблонным Home
    ├── admin/
    │   ├── Admin.tsx          Вход, навигация, обзор, услуги, медиа, настройки
    │   ├── OrdersClients.tsx  Заявки, клиенты, история и кошелёк
    │   ├── Editors.tsx        Редакторы страниц, квиза и планера
    │   └── api.ts             API-клиент, статусы и форматирование
    ├── components/ui/         Библиотека shadcn/ui исходного шаблона
    ├── hooks/                 Hook исходной библиотеки компонентов
    ├── lib/utils.ts           Утилита классов для shadcn/ui
    └── pages/Home.tsx         Неиспользуемый Vite-шаблон; кандидат на удаление
```

## Рабочий код и данные

- Рабочий серверный путь: `server.mjs` → `content-seed.mjs` и `storage.mjs`.
- Рабочий клиентский путь: `src/main.tsx` → `src/App.tsx` → публичные компоненты, `SiteHome`, `Account` или `admin/*`.
- `src/data.ts` не является удалённым старым файлом: он нужен как fallback и содержит вопросы партнёра.
- `public/illustrations` используется публичным интерфейсом. Оптимизированные WebP являются рабочими assets.
- `src/components/ui`, `src/hooks`, `src/lib` сейчас не импортируются продуктовыми экранами напрямую, но являются библиотекой шаблона. Не удалять массово без отдельной задачи и проверки сборки.

## Черновики, временные файлы и кандидаты на удаление

Сам агент файлы не удаляет. Решение принимает владелец отдельной задачей.

- `info.md` — устаревшая заметка исходного шаблона с несуществующим путём `/mnt/agents/output/app`.
- `src/pages/Home.tsx` — неиспользуемый шаблонный счётчик Vite.
- `src/App.css` — после удаления шаблонного `Home.tsx` станет неиспользуемым; сейчас импортируется только им.
- `dist/` — воспроизводимая сборка, не исходный код; в Git не входит.
- `node_modules/` — восстанавливается через `npm ci`; в Git не входит.
- `test-output/` — временные БД, загрузки, скриншоты и диагностика тестов; в Git не входит.
- `wedding.db`, `wedding.db-shm`, `wedding.db-wal` в корне при локальном запуске — не мусор, а локальные данные. Удалять только после подтверждения владельца и резервной копии.
- В родительской рабочей папке `../incoming-task.txt`, `../incoming-role.txt` — копии задания на передачу, не входят в репозиторий.
- В родительской рабочей папке `../.handover-tmp/` — локальные утилиты чтения серверной конфигурации, не входят в репозиторий.

Серверные резервные копии в `/var/lib/bride-assistant/backups/` кандидатами на удаление не являются.
