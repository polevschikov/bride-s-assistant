export type Option={value:string,label:string,hint?:string,tone?:string};
export type Question={id:string,title:string,text:string,type:'entry'|'choice'|'multi'|'range'|'date'|'upload'|'number'|'text'|'text_or_photo',options?:Option[],min?:number,max?:number,step?:number,unit?:string,maxSelect?:number};
const entry:Question={id:'branch',title:'Выберите вашу ситуацию',text:'После этого входа будет ровно пять вопросов. Контакт для результата не нужен.',type:'entry',options:[
 {value:'has_budget',label:'Есть бюджет',hint:'Проверить, на что его хватит',tone:'linear'},
 {value:'has_elements',label:'Есть элементы, собрать воедино',hint:'Площадка, референсы или отдельные идеи',tone:'grid'},
 {value:'no_time',label:'Мало времени',hint:'Понять, что требует внимания сначала',tone:'clock'},
 {value:'dont_know',label:'Не знаю, чего хочу',hint:'Сформировать направление с нуля',tone:'arch'}
]};
const locations:Option[]=[{value:'restaurant',label:'Ресторан',hint:'Интерьер и сервис'},{value:'loft',label:'Лофт',hint:'Свет и чистая геометрия'},{value:'country',label:'Загородный дом',hint:'Единое пространство дня'},{value:'garden',label:'Сад или терраса',hint:'Природа и открытый воздух'},{value:'hall',label:'Банкетный зал',hint:'Классический масштаб'},{value:'unknown',label:'Пока не знаю',hint:'Подобрать по атмосфере'}];
const styles:Option[]=[{value:'modern',label:'Тихая современность',hint:'Чистые линии, свет, сдержанная палитра'},{value:'garden',label:'Садовая естественность',hint:'Живые цветы, фактура, мягкие формы'},{value:'classic',label:'Новая классика',hint:'Симметрия, свечи, глубокие оттенки'}];
const priorities:Option[]=[{value:'food',label:'Кухня и атмосфера'},{value:'photo',label:'Фотографии'},{value:'decor',label:'Декор и цветы'},{value:'music',label:'Музыка и ведущий'},{value:'outfit',label:'Образы'},{value:'coordination',label:'Координация дня'}];
const budgetQuestion:Question={id:'budget_range',title:'Какой бюджет?',text:'Выберите комфортную верхнюю границу диапазона. Это ориентир, а не точная смета.',type:'range',min:200000,max:1500000,step:50000,unit:'₽'};
const guestsQuestion:Question={id:'guests',title:'Сколько гостей?',text:'Укажите приблизительное число — его можно изменить позже.',type:'number',min:2,max:300};
export const branches:Record<string,Question[]>={
 has_budget:[entry,budgetQuestion,guestsQuestion,
 {id:'location_type',title:'Какой тип локации ближе?',text:'Шесть направлений — выберите одно по ощущению.',type:'choice',options:locations},
 {id:'style',title:'Какой стиль вам близок?',text:'Три визуальных направления, без обязательства следовать им буквально.',type:'choice',options:styles},
 {id:'spend_top3',title:'На что потратить больше?',text:'Выберите не больше трёх приоритетов.',type:'multi',maxSelect:3,options:priorities}],
 has_elements:[entry,
 {id:'already_chosen',title:'Что уже выбрано?',text:'Перечислите свободным текстом: площадку, фотографа, образы, декор или свои идеи.',type:'text'},
 {id:'photos',title:'Опишите или загрузите фото',text:'Добавьте до трёх референсов и коротко поясните, что в них нравится.',type:'text_or_photo'},
 guestsQuestion,
 {id:'budget_left',title:'Какой остаток бюджета?',text:'Укажите верхнюю границу оставшейся суммы.',type:'range',min:50000,max:1500000,step:50000,unit:'₽'},
 {id:'not_chosen',title:'Что ещё не выбрано?',text:'Напишите, какие элементы нужно найти и собрать в единую картинку.',type:'text'}],
 no_time:[entry,
 {id:'wedding_date',title:'Когда свадьба?',text:'Если точной даты нет, выберите ожидаемую — план можно перестроить.',type:'date'},guestsQuestion,
 {id:'budget',title:'Какой бюджет?',text:'Выберите комфортную верхнюю границу.',type:'range',min:200000,max:1500000,step:50000,unit:'₽'},
 {id:'done',title:'Что уже сделано?',text:'Коротко перечислите готовые решения и бронирования.',type:'text'},
 {id:'critical_top3',title:'Что критично сделать сейчас?',text:'Выберите не больше трёх задач.',type:'multi',maxSelect:3,options:priorities}],
 dont_know:[entry,guestsQuestion,
 {id:'location_type',title:'Какой тип локации представляете?',text:'Выберите одну из шести визуальных сцен.',type:'choice',options:locations},
 {id:'style',title:'Какой стиль откликается?',text:'Выберите направление по атмосфере, а не по отдельным предметам.',type:'choice',options:styles},
 {id:'priorities_top3',title:'Что для вас важнее?',text:'Выберите не больше трёх приоритетов.',type:'multi',maxSelect:3,options:priorities},budgetQuestion]
};
export const extraQuestions:Question[]=[
 {id:'ceremony',title:'Нужна ли выездная церемония?',text:'Последний уточняющий блок перед результатом.',type:'choice',options:[{value:'yes',label:'Да'},{value:'no',label:'Нет, регистрация отдельно'},{value:'unknown',label:'Пока не решили'}]},
 {id:'season',title:'В каком сезоне праздник?',text:'Сезон влияет на площадку, свет и логистику.',type:'choice',options:[{value:'summer',label:'Лето'},{value:'autumn',label:'Осень'},{value:'winter',label:'Зима'},{value:'spring',label:'Весна'}]},
 {id:'contactLater',title:'Как удобнее продолжить?',text:'Контакт здесь не нужен — просто выберите следующий шаг.',type:'choice',options:[{value:'self',label:'Сначала поработаю сама'},{value:'help',label:'Возможно, понадобится помощь'}]}
];
export const services=[
 {id:'venue',name:'Подбор площадки',price:2500,result:'Подбор вариантов по согласованным критериям',includes:['Уточнение ваших ограничений','Поиск и первичное сравнение вариантов','Итоговый список с пояснениями'],excludes:'Бронирование, переговоры о скидках и проверка договора'},
 {id:'photo',name:'Подбор фотографа',price:2500,result:'Подбор специалистов по стилю и задаче',includes:['Уточнение визуальных предпочтений','Просмотр портфолио и условий','Список кандидатов с комментариями'],excludes:'Бронирование даты и заключение договора'},
 {id:'contract',name:'Проверка договора',price:1500,result:'Разбор условий и список вопросов к подрядчику',includes:['Проверка состава работ и доплат','Порядок отмены и переноса','Список пунктов для уточнения'],excludes:'Юридическое заключение и представление интересов'},
 {id:'budget',name:'Аудит бюджета',price:1500,result:'Взгляд специалиста на структуру расходов',includes:['Проверка основных статей','Поиск пропущенных расходов','Рекомендации по приоритетам'],excludes:'Ведение сметы план/факт и бронирование'},
 {id:'consult',name:'Консультация для пары',price:2000,result:'Обсуждение разногласий и общего решения',includes:['Разбор карты компромиссов','Приоритеты каждого','Следующие договорённости'],excludes:'Полная организация свадьбы'},
 {id:'coordinator',name:'Подбор координатора',price:3000,result:'Поиск кандидата для координации дня',includes:['Уточнение формата и задач','Поиск и первичный отбор','Передача кандидатов с комментариями'],excludes:'Работа координатора в день свадьбы'}
];
export const partnerQuestions:Question[]=[
 {id:'guests',title:'Какой масштаб вам ближе?',text:'Ваши ответы сравнятся только с ответами по этому приглашению.',type:'choice',options:[{value:'small',label:'До 20 гостей'},{value:'medium',label:'20–60 гостей'},{value:'large',label:'60–100 гостей'}]},
 {id:'budget',title:'Какой бюджет кажется комфортным?',text:'Это личный ориентир для разговора, не обязательство.',type:'range',min:200000,max:1500000,step:50000,unit:'₽'},
 {id:'place',title:'Какая локация ближе?',text:'Выберите один вариант.',type:'choice',options:[{value:'city',label:'Город'},{value:'nature',label:'Природа'},{value:'any',label:'Не принципиально'}]},
 {id:'mood',title:'Каким должен быть день?',text:'Выберите атмосферу, а не стиль декора.',type:'choice',options:[{value:'quiet',label:'Камерным'},{value:'beautiful',label:'Торжественным'},{value:'free',label:'Непринуждённым'}]},
 {id:'format',title:'Какой формат предпочитаете?',text:'Можно выбрать несколько.',type:'multi',options:[{value:'dinner',label:'Ужин'},{value:'classic',label:'Банкет'},{value:'party',label:'Вечеринка'}]},
 {id:'priorities',title:'Что для вас важнее?',text:'Выберите до трёх пунктов.',type:'multi',options:[{value:'food',label:'Кухня'},{value:'photo',label:'Фотографии'},{value:'decor',label:'Декор'},{value:'music',label:'Музыка'}]},
 {id:'no',title:'Что точно не хотите?',text:'Это поможет не предлагать неподходящие компромиссы.',type:'choice',options:[{value:'large',label:'Много гостей'},{value:'outdoor',label:'Праздник на улице'},{value:'formal',label:'Официальность'},{value:'none',label:'Жёстких ограничений нет'}]}
];
export const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₽';
