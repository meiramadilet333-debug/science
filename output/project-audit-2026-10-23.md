**Аудит «Научного навигатора» — 23 октября 2026**

**Общая оценка**

Проект представляет собой функциональный прототип с хорошей технической основой, которому нужна стабилизация перед расширением нагрузки и сценариев. Разделение на frontend, API и контрактные пакеты уже существует. Главные проблемы сосредоточены внутри этих границ: крупные модули объединяют слишком много обязанностей, часть API развивается вне OpenAPI, локальные данные не имеют единого надежного слоя хранения, а отдельные алгоритмы дают неверные результаты.

Полная перепись не оправдана. Рекомендуется сохранить модульный монолит, исправить ошибки корректности, затем последовательно извлекать существующую логику в небольшие модули. Микросервисы, глобальная мемоизация React и замена стека сейчас не имеют доказанного преимущества.

Аудит выполнен без изменения исходников. Изучены конфигурация workspace, оба frontend, маршруты API, интеграции, OpenAPI, generated client/Zod, DB scaffold и существующие проверочные скрипты. Этот отчет — единственный добавленный документ. Каталога `.git` в предоставленной копии нет; оценка истории изменений и сравнение с веткой недоступны. Папочных AGENTS.md в проверенных каталогах и предках не найдено.

**Стек и текущая архитектура**

| Часть | Реализация | Состояние |
| --- | --- | --- |
| Workspace | pnpm workspaces, TypeScript 5.9, Node.js 24 | Общий каталог версий, project references |
| Основной интерфейс | React 19, Vite 7, Wouter, TanStack Query, Tailwind 4, Radix/shadcn | Большинство страниц и доменная логика находятся в App.tsx |
| Preview | artifacts/mockup-sandbox | Отдельное приложение, частично дублирует UI |
| API | Express 5, Pino, esbuild ESM | Маршруты разделены по сценариям; общие сервисы перегружены |
| Контракты | OpenAPI → Orval → React Query client и Zod 3 | Покрывают 11 из 17 операций |
| Интеграции | OpenAlex, OpenAI Responses, официальные источники грантов | Есть таймауты и проверки формата; нет общего управления нагрузкой |
| Хранение | localStorage | Исследования, статьи, публикационные проверки, библиотека и профиль хранятся в браузере |
| База данных | PostgreSQL/Drizzle scaffold | Схема пуста, runtime-использования DB в приложениях не найдено |

Основной поток: React → generated client или ручной fetch → Express route → scientific/grant use case → внешний провайдер. Пользовательские документы сохраняются отдельно в localStorage. Узким местом работы с данными сейчас являются внешние HTTP-вызовы и браузерное хранение. Оснований искать N+1 или оптимизировать SQL-индексы в текущем приложении нет.

Положительные стороны: есть интерфейс ScientificSource, Zod-валидация большинства API, типизированные ошибки провайдера, ограничение объема литературного контекста, редактирование секретов в логах, ErrorBoundary и поддержка RU/KK. Каталог грантов уже имеет TTL и объединяет одновременные обновления. Canvas уже учитывает reduced motion, мобильный DPR и скрытие вкладки. Ранее внесенные линейные алгоритмы обработки аннотаций, подсчета источников и построения фильтров сохранены и проходят свои проверки.

**Что проверено исполнением**

| Проверка | Результат |
| --- | --- |
| TypeScript: db, api-zod, api-client-react, api-server, scientific-navigator, mockup-sandbox, scripts | Все 7 проектов прошли; служебные tsbuildinfo направлены во временный каталог |
| Production Vite build основного интерфейса | Успешно; выход направлен во временный каталог |
| Основной JS | Один файл 717,65 КБ; gzip 204,25 КБ |
| Основной CSS | 147,21 КБ; gzip 27,37 КБ |
| Предупреждения Vite | JS chunk больше 500 КБ; две диагностики sourcemap для tooltip/label не остановили сборку |
| API bundle в памяти | Успешно, без записи dist; это не проверка полного production-пакета с Pino workers |
| Сборка mockup-sandbox без специальных env | Завершилась ошибкой: PORT environment variable is required |
| output/refactoring-iteration-1/verify.cjs | PASS: 1015 случаев аннотаций и 1000 случаев подсчета источников |
| output/refactoring-iteration-2/verify.cjs | PASS: 1001 сравнение фильтров, 3 сценария кэша/дат, проверка числа Date.parse |
| Даты, дедупликация, короткие идеи | Дефекты воспроизведены локально на текущих функциях с искусственными входными данными, без сети |

Внешние API, платные AI-запросы, реальная PostgreSQL и нагрузочный браузерный профиль не запускались. Поэтому проценты ускорения, фактические p95 и пропускная способность не заявляются. Задержки при вводе и FPS требуют отдельного измерения; размер сборки и перечисленные ошибки уже подтверждены.

**Находки по приоритету**

P1 — высокий приоритет исправления; P2 — следующий плановый этап; P3 — улучшение после стабилизации. Условие публичного доступа для риска расходов указано отдельно.

| № | Приоритет | Наблюдение и последствие | Основание |
| --- | --- | --- | --- |
| 1 | P1 | Парсер окончания приема берет первую дату диапазона. «Прием заявок с 01.10.2026 до 30.11.2026» дает дедлайн 01.10 и статус closed на 23.10. Открытый конкурс может исчезнуть из каталога. Числовая дата 31.02.2027 превращается в 03.03.2027. | [grant-opportunities.ts](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/api-server/src/lib/grant-opportunities.ts:242>) |
| 2 | P1 | Ответ ИИ применяется без проверки актуальности исходных данных. Во время подготовки плана можно изменить тему или источники; поздний ответ записывает план старой темы. Аналогичная проблема есть у проверки публикационных требований. | [App.tsx: подготовка плана](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/scientific-navigator/src/App.tsx:2598>), [проверка публикации](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/scientific-navigator/src/App.tsx:2934>) |
| 3 | P1 при публичном доступе | AI-маршруты используют серверный ключ без ограничителя частоты и общей параллельности. Сквозной отмены и явного ограничения output tokens нет. В предоставленном коде нет авторизации; наличие защиты на внешнем gateway не установлено. Возможен неконтролируемый рост затрат и очередей. | [app.ts](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/api-server/src/app.ts:28>), [AI transport](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/api-server/src/lib/idea-analysis.ts:144>) |
| 4 | P2 | Дедупликация объединяет разные конкурсы по датам, организатору и направлению. Два разных id/title/url с этими совпавшими полями дают одну запись. | [ключ дедупликации](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/api-server/src/lib/grant-opportunities.ts:1060>) |
| 5 | P2 | Идеи «AI in law», «AI in medicine», «ВИЧ и рак» проходят контракт длины, но отвергаются требованием минимум двух слов длиной от пяти символов. Ошибка input классифицируется как invalid_response и превращается в 502. | [prepareIdeaCheckQuery](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/api-server/src/lib/idea-analysis.ts:496>), [ответ маршрута](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/api-server/src/routes/scientific-research.ts:314>) |
| 6 | P2 | Доступ к localStorage при инициализации языка находится вне try. SecurityError прерывает загрузку i18n до создания React root, поэтому ErrorBoundary не поможет. Запись языка также может оставить global locale и React state несогласованными. | [i18n.tsx](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/scientific-navigator/src/lib/i18n.tsx:739>) |
| 7 | P2 | getDrafts утверждает тип Draft, проверив лишь id/text/updatedAt. Запись с research: {} проходит проверку, но экран обращается к research.analysis.problem и падает. | [неполная валидация](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/scientific-navigator/src/App.tsx:398>), [использование](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/scientific-navigator/src/App.tsx:3315>) |
| 8 | P2 | OpenAPI не описывает пять /grants/* и /scientific/assistant. Frontend дублирует DTO, парсинг и HTTP-обработку вручную. Типы между этими слоями не проверяются единым контрактом. | [OpenAPI](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/lib/api-spec/openapi.yaml:18>), [grants routes](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/api-server/src/routes/grants.ts:16>), [assistant route](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/api-server/src/routes/scientific-assistant.ts:22>) |
| 9 | P2 | На каждый ввод сериализуется весь массив статей или публикационных проверок и синхронно записывается в localStorage. Стоимость растет со всем архивом. Фактический input lag еще не измерен. Независимые snapshot-хуки также допускают перезапись данных другой вкладки. | [autosave статей](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/scientific-navigator/src/App.tsx:2556>), [autosave проверок](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/scientific-navigator/src/App.tsx:2862>), [useDrafts](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/scientific-navigator/src/App.tsx:505>) |
| 10 | P2 | OpenAlex всегда получает до 50 записей, хотя поиск источников показывает 20, а анализ использует до 12. При подготовке плана и помощи по каждому разделу повторно загружаются те же до 8 публикаций. Кэша metadata и объединения одинаковых запросов нет. | [OpenAlexSource](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/api-server/src/lib/scientific-sources/openalex.ts:8>), [getVerifiedWorks](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/api-server/src/routes/scientific-works.ts:20>) |
| 11 | P2 | Проверка идеи последовательно выполняет AI → OpenAlex → до четырех fallback search → AI. Отдельные лимиты 60/20 секунд не задают общий deadline: теоретический бюджет цепочки до ~220 секунд. Это верхняя оценка по коду, не измеренная задержка. | [цепочка проверки](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/api-server/src/routes/scientific-research.ts:209>) |
| 12 | P2 | App.tsx содержит 3551 строку: страницы, типы, storage, валидаторы, запросы и обработку ошибок. idea-analysis.ts соединяет транспорт, prompts, JSON Schemas и множество сценариев. grant-opportunities.ts соединяет HTTP, HTML parsing, даты, правила отбора, DTO и кэш. Это усложняет изолированные изменения. | [App.tsx](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/scientific-navigator/src/App.tsx:1>), [idea-analysis.ts](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/api-server/src/lib/idea-analysis.ts:122>), [grant-opportunities.ts](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/api-server/src/lib/grant-opportunities.ts:1>) |
| 13 | P2 | Все основные страницы загружаются статически. Сборка выдает один JS размером 717,65 КБ. Есть основания разделить загрузку по маршрутам; выигрыш по времени загрузки следует измерить после разделения. | [Router](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/scientific-navigator/src/App.tsx:3530>) |
| 14 | P2 | Корневая сборка включает sandbox, конфигурация которого требует PORT/BASE_PATH даже для build. Сборка без PORT воспроизводимо падает, хотя основное приложение собирается. | [root build](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/package.json:6>), [sandbox config](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/mockup-sandbox/vite.config.ts:8>) |
| 15 | P2 | Нет единой команды test/lint и конфигурации CI в доступной копии. Два полезных regression script находятся в output и извлекают функции через AST, поэтому не проверяют реальную композицию модулей/API. | [scripts проекта](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/package.json:5>), [существующая проверка](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/output/refactoring-iteration-1/verify.cjs:1>) |
| 16 | P2 | Охват каталога ограничен: первые 10 объявлений берутся до фильтра релевантности; gov.kz ограничен свежими новостями. Активный конкурс вне этого окна не найдется. Охват не равен всем открытым конкурсам. | [parseAnnouncements](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/api-server/src/lib/grant-opportunities.ts:124>), [фильтр](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/api-server/src/lib/grant-opportunities.ts:440>) |

**Дополнительный долг и дублирование**

- В App.tsx остался недостижимый из Router грантовый workflow: локальные GrantOpportunities и GrantsPage, примерно строки 1093–2280. Маршрут /grants ведет в импортированный GrantsCatalogPage. Это долг сопровождения; нельзя считать весь этот код частью production payload, поскольку Rollup может удалить его. Удаление требует решения, нужны ли эти продуктовые сценарии в будущем.
- В обоих frontend по 55 одноименных UI-модулей. Пять совпадают после нормализации токенов, остальные имеют разную степень сходства. Есть повторяющиеся hooks/utils и разошедшиеся версии зависимостей. Выделять общий UI следует после инвентаризации реально используемых компонентов.
- analyzeScientificIdea повторяет HTTP-запрос, диагностику и JSON parsing из requestStructuredOutput. Обработка одной ошибки провайдера также расходится между routes: часть сценариев возвращает 429/504, часть — 502. Нужен общий mapper, сохраняющий отдельные типы input/provider/timeout/internal ошибок.
- Грантовые AI-функции не передают язык в общий transport и используют его RU по умолчанию. Текущий Router не открывает старый грантовый workflow; видимое влияние на основной интерфейс ниже, чем у ошибок текущих страниц.
- FloatingAIAssistant собирает контекст через document.getElementById и список строковых id. Переименование поля может молча убрать контекст. Явный adapter текущего feature надежнее.
- В кэшированном каталоге пересчитываются opportunities/counts, но сохраняется старое message с числом конкурсов. После дедлайна сообщение может противоречить списку. При полном сбое источников обновление заменяет предыдущий результат пустым; для будущего stale режима нужны lastSuccessfulResult и явная маркировка непроверенных данных.
- В custom-fetch.ts:114–124 используется response.body == null при комментарии о строгом сравнении. Mock Response с body: undefined и рабочим text() воспроизводимо теряет JSON. Для стандартного браузерного Response проблема не подтверждена; низкий приоритет.
- post-merge.sh безусловно запускает db push при пустой схеме и неиспользуемом runtime DB; конфигурация требует DATABASE_URL. Следует убрать неявную зависимость установки от БД, а реальные изменения схемы проводить отдельными версионируемыми миграциями.
- Документация replit.md отстала от реализации: заявлены Zod v4, CJS и обязательный runtime DB, тогда как API-генератор настроен на Zod 3, сборка использует ESM, runtime-импорты DB отсутствуют. Сосуществуют package-lock.json и pnpm-lock.yaml; следует закрепить один поддерживаемый путь установки.
- DigitalWaves рисует desktop-сцену до 50 FPS даже в idle; невидимость вне viewport не учитывается. Это кандидат на IntersectionObserver/понижение idle FPS после профиля. Утверждать текущие проблемы FPS без замеров нельзя.

**Быстрые победы**

| Изменение | Эффект | Риск и проверка |
| --- | --- | --- |
| Строгие даты и явное различение «с … до …» | Открытые конкурсы не скрываются из-за начала периода; невозможные даты отклоняются | Низкий–средний: fixture-набор разных формулировок, високосного года и границ суток |
| Дедупликация по идентичности конкурса | Не теряются разные программы с совпавшими датами | Средний: один конкурс с несколькими публикациями нельзя объединять только по похожим полям |
| Защита от позднего AI-ответа | Результат соответствует текущей теме, источникам и требованиям | Средний: delayed response, изменение полей, смена документа, ошибка/отмена |
| Защищенный storage для языка | Приложение открывается при отказе localStorage | Низкий: getItem/setItem бросают SecurityError; locale остается согласованным |
| Разделение app build и sandbox build | Основная сборка не требует env preview-сервера | Низкий: build API+UI без sandbox env; отдельная проверка sandbox |
| Интеграция имеющихся regression checks | Проверки воспроизводятся одной командой | Низкий: запуск из чистой копии; позже заменить AST-extraction импортами чистых модулей |
| Документация, единый package manager, явное управление DB | Меньше ошибок установки и эксплуатации | Низкий: сверка команд с текущими manifests |

Debounce сохранения тоже даст небольшой по объему патч, но имеет риск потери последних изменений. Его стоит вводить вместе с flush при навигации/pagehide и понятным статусом сохранения. На первом шаге безопаснее не смешивать это изменение с новым форматом хранения.

**Фундаментальные улучшения**

1. **Модульный монолит по сценариям.** В frontend выделить features/research, articles, publications, sources, grants; общие API/storage/error handling оставить в shared. App отвечает за providers, layout и routes. В backend route выполняет HTTP validation/mapping, use case управляет сценарием, provider adapter отвечает за внешнюю систему. Чистые правила дат и нормализации не зависят от Express/fetch.
2. **Единый контракт.** Описать оставшиеся шесть операций в OpenAPI без смены их текущего поведения. Перегенерировать client/Zod, перевести grants и assistant на общий transport. Ввести проверку соответствия endpoints контракту и проверку drift generated-файлов.
3. **Надежное хранение документов.** Сначала полный runtime schema, version и recovery по отдельным поврежденным записям. Затем repository с revision, observable store и синхронизацией вкладок. IndexedDB имеет смысл при росте архива; серверная БД — когда появятся аккаунты/синхронизация, с отдельными требованиями миграции и доступа.
4. **Контроль внешних операций.** Внедрить OpenAlex metadata cache по нормализованному id и параметрам поиска, ограниченный TTL/размер, объединение одинаковых запросов и bounded concurrency. У каждого сценария должен быть общий deadline и AbortSignal. Ограничивать AI-операции по пользователю/сессии и общей параллельности. Не вводить глобальный cache частных AI-ответов без модели владения данными.
5. **Управление грантовыми источниками.** Разделить provider fetch, parser, normalization, identity/dedup, freshness и presentation. Хранить evidence для распознанных сроков; неоднозначность показывать как неподтвержденные данные. Добавить coverage/ограничение обхода. Не выдавать недоступность источника за доказанное отсутствие конкурсов.
6. **Загрузка и runtime-производительность.** После извлечения страниц добавить lazy imports и Suspense. Сравнить начальную JS-загрузку и время открытия маршрутов. Профилировать ввод на больших локальных архивах и canvas на слабом устройстве; только затем менять хранение, FPS или мемоизацию конкретного компонента.

**Конкретные примеры «Было / Стало»**

Ниже эскизы предлагаемых изменений, а не уже примененный патч. Новые abstractions и schemas потребуется реализовать и проверить в отдельных согласованных итерациях.

**1. Парсинг срока: явный период и строгий календарь**

Было — [grant-opportunities.ts:247](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/api-server/src/lib/grant-opportunities.ts:247>):

```ts
const date = new Date(Date.UTC(
  Number(numeric[3]), Number(numeric[2]) - 1,
  Number(numeric[1]), 23, 59, 59,
));
if (!Number.isNaN(date.getTime())) return date;
// 31.02 автоматически нормализуется; regex выше может взять начало диапазона.
```

Стало — единый строгий primitive плюс отдельные правила извлечения:

```ts
function strictDate(day: number, month: number, year: number): Date | null {
  if (![day, month, year].every(Number.isInteger)) return null;
  if (year < 2020 || year > 2100 || month < 1 || month > 12) return null;
  const value = new Date(Date.UTC(year, month - 1, day, 23, 59, 59));
  return value.getUTCFullYear() === year &&
    value.getUTCMonth() === month - 1 && value.getUTCDate() === day
    ? value : null;
}

// parser отдельно распознает явный диапазон и конечный срок:
const period = parseApplicationPeriod(sourceText);
// { startsOn, endsOn, endsAt, evidence, confidence }
```

Критерий: диапазон 01.10–30.11 дает endsOn=2026-11-30; 31.02 отклоняется. Неоднозначные даты не превращаются в «подтвержденный открытый прием».

**2. Результат ИИ привязывается к ревизии документа**

Было — [App.tsx:2610](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/scientific-navigator/src/App.tsx:2610>):

```ts
const plan = await prepareScientificArticle({
  idea: article.idea.trim(),
  sourceIds: article.sourceIds.slice(0, 8),
});
updateArticle({ plan, structureApproved: false, sectionGuidance: {} });
```

Стало — revision меняется при изменении влияющих на результат данных:

```ts
const snapshot = { id: article.id, revision: article.revision };
const plan = await prepareScientificArticle(payload, { signal });
articleRepository.applyIfRevision(snapshot, {
  plan,
  structureApproved: false,
  sectionGuidance: {},
});
```

Проверка ревизии должна происходить атомарно при применении результата. Она защищает даже тогда, когда отмененный запрос успел завершиться. В первой минимальной итерации guard можно реализовать в функциональном setState без переноса всего storage.

**3. Повторные библиографические вызовы заменяются общим repository**

Было — [scientific-works.ts:20](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/api-server/src/routes/scientific-works.ts:20>):

```ts
const works = await Promise.all(
  [...new Set(ids)].map(id => openAlexSource.getWorkById(id)),
);
```

Стало:

```ts
const works = await publicationRepository.getMany(ids, {
  signal,
  concurrency: 4,
  cacheTtlMs: metadataTtl,
});
```

Repository кэширует только проверенные metadata, ограничивает размер кэша и объединяет одновременные вызовы одного id. Ошибки не закрепляются как успешный пустой результат. Значения TTL/concurrency выбираются после измерения и учета ограничений провайдера.

**4. Маршруты загружают собственные страницы**

Было — [App.tsx:3530](<D:/Новая папка (2)/PROJECTS/Nauchnyi-navighator-main/artifacts/scientific-navigator/src/App.tsx:3530>): все основные страницы находятся в App.tsx либо импортируются статически.

Стало — после переноса страницы с сохранением поведения:

```tsx
const ScientificWorksPage = lazy(() => import('./pages/scientific-works'));

<Suspense fallback={<PageLoading />}>
  <Route path="/works" component={ScientificWorksPage} />
</Suspense>
```

Приемка: прямое открытие маршрута и обновление страницы работают; обработка ошибок загрузки сохранена; начальная загрузка не включает код еще не открытых тяжелых страниц. Итог сравнивается с текущими 204,25 КБ gzip JS.

**Пошаговый план с отдельным согласованием каждого этапа**

| Этап | Содержание | Критерий приемки |
| --- | --- | --- |
| 1. Корректность каталога | Fixtures текущих формулировок; исправление диапазонов/невозможных дат; безопасная идентичность конкурсов | Диапазон не закрывает открытый конкурс; 31.02 отклоняется; два разных конкурса с одними датами сохраняются; существующие regression checks проходят |
| 2. Целостность UI | Guard поздних ответов статьи/публикации; безопасный locale storage; полная проверка сохраненных исследований с recovery | Delayed response не применяется после правки; поврежденная запись не ломает экран; отказ storage не мешает старту |
| 3. Стабильность API | Исправить короткие научные input и классификацию ошибок; общий error mapping; ограничения дорогих операций | Валидные аббревиатуры не дают ложный 502; timeout/provider/input различаются; лимиты и отмена проверены mock-провайдером |
| 4. Контракты и воспроизводимость | Описать 6 отсутствующих операций; перевести клиентов; разделить app/sandbox build; подключить test/lint/CI | 17/17 операций имеют контракт; codegen детерминирован; основная сборка не зависит от env preview |
| 5. Извлечение модулей | Одна страница/use case за итерацию; общий AI transport, storage repository, чистые parsers | Существующие сценарии сохраняются; модули проверяются через реальные импорты; нет одновременной смены архитектуры и UX |
| 6. Измеряемая оптимизация | OpenAlex cache/limit/deadline; lazy routes; безопасный autosave; viewport canvas после профиля | Сопоставлены число upstream calls, p50/p95, начальные bytes и input responsiveness до/после |
| 7. Очистка | Решение по старым грантовым сценариям; общий UI для реально общей части; документация и зависимости | Нет потери нужных функций; сокращается поддерживаемый код; сборка и проверки остаются зелеными |

Перед публичным запуском ограничение платных операций из этапа 3 следует выполнить до наращивания аудитории. Переносить приложение на серверную персистентность нужно отдельным этапом после определения требований аккаунтов и синхронизации.

Для следующей итерации рекомендуется согласовать только этап 1: даты и идентичность грантов с regression fixtures. Рефакторинг исходников в рамках этого аудита не начат.
