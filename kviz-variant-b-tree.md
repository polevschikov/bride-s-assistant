{
  "project": "Свадебный квиз-бот. Вариант Б: 5 вопросов сейчас, остальное потом",
  "entry": {
    "text": "Выберите вашу ситуацию:",
    "options": [
      {
        "id": "has_budget",
        "label": "Есть бюджет"
      },
      {
        "id": "has_elements",
        "label": "Есть элементы, собрать воедино"
      },
      {
        "id": "no_time",
        "label": "Мало времени"
      },
      {
        "id": "dont_know",
        "label": "Не знаю, чего хочу"
      }
    ]
  },
  "scenarios": {
    "has_budget": {
      "questions": [
        {
          "key": "budget_range",
          "text": "Какой бюджет? Диапазон",
          "type": "text_or_range"
        },
        {
          "key": "guests",
          "text": "Сколько гостей?",
          "type": "number"
        },
        {
          "key": "location_type",
          "text": "Тип локации?",
          "type": "choice_images",
          "images_count": 6
        },
        {
          "key": "style",
          "text": "Стиль",
          "type": "choice_images",
          "images_count": "2-3"
        },
        {
          "key": "spend_top3",
          "text": "На что потратить больше? Топ-3",
          "type": "multiselect",
          "max": 3
        }
      ],
      "result": "Расчёт: укладываетесь или нет, вилка «от и до»"
    },
    "has_elements": {
      "questions": [
        {
          "key": "already_chosen",
          "text": "Что уже выбрано?",
          "type": "text"
        },
        {
          "key": "photos",
          "text": "Опишите или загрузите фото",
          "type": "text_or_photo"
        },
        {
          "key": "guests",
          "text": "Сколько гостей?",
          "type": "number"
        },
        {
          "key": "budget_left",
          "text": "Какой остаток бюджета?",
          "type": "text_or_range"
        },
        {
          "key": "not_chosen",
          "text": "Что ещё не выбрано?",
          "type": "text"
        }
      ],
      "result": "Ваш стиль и что под него искать"
    },
    "no_time": {
      "questions": [
        {
          "key": "wedding_date",
          "text": "Когда свадьба?",
          "type": "date"
        },
        {
          "key": "guests",
          "text": "Сколько гостей?",
          "type": "number"
        },
        {
          "key": "budget",
          "text": "Какой бюджет?",
          "type": "text_or_range"
        },
        {
          "key": "done",
          "text": "Что уже сделано?",
          "type": "text"
        },
        {
          "key": "critical_top3",
          "text": "Что критично? Топ-3",
          "type": "multiselect",
          "max": 3
        }
      ],
      "result": "Успеваете, впритык или нужен координатор"
    },
    "dont_know": {
      "questions": [
        {
          "key": "guests",
          "text": "Сколько гостей?",
          "type": "number"
        },
        {
          "key": "location_type",
          "text": "Тип локации?",
          "type": "choice_images",
          "images_count": 6
        },
        {
          "key": "style",
          "text": "Стиль",
          "type": "choice_images",
          "images_count": "2-3"
        },
        {
          "key": "priorities_top3",
          "text": "Приоритеты: топ-3",
          "type": "multiselect",
          "max": 3
        },
        {
          "key": "budget_range",
          "text": "Бюджет: вилка",
          "type": "text_or_range"
        }
      ],
      "result": "Стиль на N гостей, бюджет «от и до»"
    }
  },
  "shared_result": {
    "text": "Итог для всех веток: бесплатный планинг",
    "rules": [
      "Сформировать задачи по месяцам из ответов квиза",
      "Ответы из уточнения и переписки дополняют планинг",
      "У каждой задачи — кнопка «Делегировать»"
    ],
    "delegate_services": [
      {
        "id": "venue_search",
        "name": "Подобрать площадку",
        "price_rub": 2500
      },
      {
        "id": "estimate_check",
        "name": "Проверить смету",
        "price_rub": 1500
      },
      {
        "id": "search_3days",
        "name": "Подбор за 3 дня",
        "price_rub": 2500
      },
      {
        "id": "consult",
        "name": "Консультация",
        "price_rub": 2000
      }
    ]
  },
  "after_result": {
    "text": "После результата (для всех веток): что дальше?",
    "options": [
      {
        "id": "refine_calc",
        "label": "1. Уточнить расчёт",
        "steps": [
          "Структура: церемония, банкет, второй день, тайминг",
          "Чего точно не хотим?",
          "Контакт: телефон и удобный мессенджер",
          "Точный расчёт и план приходят в мессенджер"
        ]
      },
      {
        "id": "send_plan",
        "label": "2. Прислать план в мессенджер",
        "steps": [
          "Контакт: телефон и удобный мессенджер",
          "День 1: какая палитра? Подборка декора",
          "День 3: какой тон? Идеи для программы",
          "День 5: есть дата? Что бронировать первым",
          "Предложение микроуслуги"
        ]
      },
      {
        "id": "specialist_help",
        "label": "3. Помощь специалиста",
        "steps": [
          "Выбор микроуслуги: аудит, подбор, консультация",
          "Бриф: фото референсов и что уже выбрано",
          "Бриф: точный бюджет и дата",
          "Контакт и оплата",
          "Работа специалиста"
        ]
      },
      {
        "id": "invite_partner",
        "label": "4. Пригласить партнёра",
        "steps": [
          "Ссылка партнёру",
          "Что совпадает? Где разногласия?",
          "Его стиль, приоритеты, что неприемлемо",
          "Карта компромиссов",
          "Микроуслуга: консультация, 2 000 ₽"
        ]
      }
    ]
  }
}