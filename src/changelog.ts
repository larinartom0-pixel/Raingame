export interface ChangelogEntry {
  version: string;
  date: string;
  title: {
    uk: string;
    en: string;
  };
  changes: {
    uk: string[];
    en: string[];
  };
}

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: '1.7.0',
    date: '2026-11-24',
    title: {
      uk: 'Автопошук музики, вінілова пластинка, 10 рівнів карми та стартове передзавантаження',
      en: 'Auto Music Discovery, Spinning Vinyl Toast, 10 Karma Levels & Startup Preloader',
    },
    changes: {
      uk: [
        'Перероблено систему музики під автоматичне сканування папок (Main_menu, In_game, In_battle): нові треки підхоплюються автоматично без редагування коду, разом з ID3-назвою, автором та обкладинкою (або сусіднім зображенням). У Налаштуваннях додано кнопку оновлення списку та мініатюри обкладинок.',
        'Додано анімовану вінілову пластинку зліва зверху: при старті кожного треку вона виїжджає, крутиться кілька секунд з обкладинкою, категорією, назвою та автором, і плавно заїжджає назад.',
        'Розширено систему карми з 5 до 10 рівнів (I–X): додано нові символи VI «Зречення», VII «Пробудження», VIII «Гармонія», IX «Поріг» та X «Вознесіння» із золотистим сяйвом, оновлено підказки HUD та сітку 1–10 на екрані завершення циклу.',
        'Додано стартовий екран завантаження при відкритті сторінки з миттєвим передзавантаженням музики, реальним прогресом у відсотках і мегабайтах (МБ) та кнопкою «Пропустити», яка зʼявляється через 6 секунд і одразу відкриває меню вибору мови.',
      ],
      en: [
        'Refactored music loading into automatic folder discovery (Main_menu, In_game, In_battle): new audio files are detected automatically without code edits, complete with ID3 title, artist, and embedded/sidecar cover art plus a Settings rescan button.',
        'Added a top-left spinning vinyl record notification toast that slides in whenever a track starts playing, displaying its cover artwork, category badge, title, and artist before smoothly retracting.',
        'Expanded the Karma system from 5 to 10 levels (I–X) with sacred glyphs for VI Detachment, VII Awakening, VIII Harmony, IX Threshold, and X Ascension, updated HUD tooltips, and upgraded the Cycle End screen to a 10-slot progression grid.',
        'Added an immediate startup loading screen that preloads game music on page load with real-time byte/MB percentage tracking and a bottom "Skip" button after 6 seconds that jumps straight to the language selection menu.',
      ],
    },
  },
  {
    version: '1.6.1',
    date: '2026-11-22',
    title: {
      uk: 'Спавн після смерті в новому циклі, видимість у спостереженні й адаптивні мобільні кнопки',
      en: 'Post-Death Cycle Respawn, Spectator Entity Sync & Responsive Mobile Controls',
    },
    changes: {
      uk: [
        'Виправлено спавн у новому циклі після смерті: очищено старі стани смерті/сну перед переходом, усунено гонку відновлення між хостом і клієнтом, а також скинуто транзит по трубах і таймер шторму при старті нового циклу.',
        'Виправлено видимість істот і предметів у режимі спостерігача: розділено запит предметів кімнати та відновлення позиції гравця, тож при спостереженні за іншим гравцем синхронізуються живі предмети, мухи-кажани, застряглі списи та ящери саме тієї локації.',
        'Перероблено сенсорні кнопки керування на телефонах: зменшено зайві нижні відступи, ігрова сцена коректно масштабується під висоту екрана, а права панель переведена у компактну 3-колонкову сітку з окремим верхнім рядом для дій («ЇСТИ», «НА СПИНУ»), щоб кнопки ніколи не виходили за межі екрана.',
      ],
      en: [
        'Fixed respawning into a new cycle after death by clearing old cycle peer states early, blocking stale restore/lizard-grab packets across cycle transitions, and resetting pipe transit and storm timers synchronously.',
        'Fixed invisible creatures, batflies, and items in spectator mode: separated room item requests from reconnect state-restoration and added continuous multi-room authoritative item & batfly syncing for occupied and spectated rooms.',
        'Redesigned mobile touch controls into a compact 3-column grid with a stacked contextual strip ("EAT", "PIGGYBACK") and proper viewport scaling so buttons stay comfortably inside both portrait and landscape phone screens.',
      ],
    },
  },
  {
    version: '1.6.0',
    date: '2026-11-22',
    title: {
      uk: 'Виправлення сну та спостереження, збереження тіла хостом, значки карми й новий екран циклу',
      en: 'Sleep & Spectator Fixes, Host State Persistence, Karma Symbols & Cycle End Screen',
    },
    changes: {
      uk: [
        'Виправлено баг телепортації під час спостереження: коли гравець спить в укритті та стежить за іншим гравцем, перемикається лише камера — його слимакокіт фізично залишається у своєму укритті.',
        'Повністю заблоковано рух, дії та переходи між локаціями під час сну, а сам слимакокіт тепер виразно скручується клубочком, підгинає лапки, заплющує очі й показує анімацію «z Z» і значок 💤 біля ніку.',
        'Покращено підключення в мультиплеєрному лобі: виправлено помилкове створення окремої кімнати при вході, збільшено таймаути сигналінгу, додано повторну перевірку списку кімнат та вхід по кліку на всю картку кімнати.',
        'Додано збереження стану гравців у хоста на весь цикл: якщо гравець вийшов або перезавантажив сторінку, його слимакокіт залишається фізично на своєму місці (видимий іншим), а при поверненні відновлюється позиція, кімната, здоровʼя та смерть (не можна ожити перезаходом).',
        'Урон від штормового дощу тепер рахується як загроза та автоматично вмикає музику небезпеки.',
        'Прискорено завершення циклу в мультиплеєрі та одиночній грі, коли всі живі гравці сплять або всі загинули.',
        'Оновлено дизайн значків карми (1–5 рівні) у HUD та додано новий кінематографічний екран завершення циклу з підсумком карми, їжі, збережених перлин і списком виживших/загиблих.',
      ],
      en: [
        'Fixed the sleep-spectating teleport bug: spectating another player now switches only the spectator camera while your slugcat stays physically inside your shelter.',
        'Locked all movement, actions, and manual room transitions while sleeping, and added a curled sleeping pose with tucked arms, soft glow, animated rising "z Z" FX, and a 💤 nametag indicator.',
        'Fixed lobby matchmaking/room joining randomly spawning a separate room: increased signaling timeouts, added list retry & concurrency guards, and made full room cards clickable.',
        'Added host-side cycle state persistence: disconnected or reloaded players leave their slugcat physically at their last spot in the world and automatically restore their room, position, health, and death state on rejoin (preventing death-relog exploits).',
        'Lethal storm rain damage now counts as active danger and triggers danger/battle music.',
        'Made cycles end quickly once all living players are asleep or all players are dead (both multiplayer and singleplayer).',
        'Upgraded Karma 1–5 geometric symbols in the HUD and added a new Cycle End overlay showing karma progression, food tally, stored pearls, and survivors/fallen.',
      ],
    },
  },
  {
    version: '1.5.0',
    date: '2026-11-22',
    title: {
      uk: 'Списи у стінах, Перлини, Вибухівка, Мухи-кажани та копіювання ченджлогу',
      en: 'Wall-Stuck Spears, Pearls, Explosives, Batflies & Copyable Changelog',
    },
    changes: {
      uk: [
        'Списи тепер застрягають горизонтально у бетонних стінах, утворюючи перекладини для лазіння й стрибків, а від металевих стін і платформ — рикошетять з іскрами та дзвоном.',
        'Додано Перлини (4 кольорові варіанти), які можна принести в укриття та зберігати там між циклами і перезавантаженнями.',
        'Додано Вибуховий спис та Бомбу-рослину (Cherrybomb): при кидку й влучанні детонують з ударною хвилею, відкиданням, тремтінням камери й тривалим оглушенням ящерів.',
        'Додано живих Мух-кажанів: вони вільно літають по локаціях, лякаються гравців та ящерів, їх можна спіймати у польоті або збити каменем/списом і зʼїсти для поповнення їжі (+1 комірка).',
        'Усі нові предмети додані в Редактор локацій, а у вікні Ченджлогу зʼявилась кнопка «КОПІЮВАТИ» для кожного запису.',
      ],
      en: [
        'Spears now embed horizontally into concrete walls to form climbable footholds, while ricocheting off metal surfaces with bright sparks and metallic clang SFX.',
        'Added collectible iridescent Pearls (4 variants) that can be carried into shelters and persisted safely across cycles and reloads.',
        'Added Explosive Spears and Cherrybombs: arming on throw/impact with shockwave blasts, heavy lizard knockback/stun, camera shake, and spark FX.',
        'Added live Batflies that flutter across rooms, evade predators, can be caught mid-air or knocked down with a thrown rock/spear, and eaten for +1 food pip.',
        'Added all new items to the Location Editor and added a one-click "COPY" button on every changelog entry card.',
      ],
    },
  },
  {
    version: '1.4.4',
    date: '2026-11-22',
    title: {
      uk: 'Налаштування, Ченджлог, Англійська мова та виправлення версії',
      en: 'Settings, Changelog, English Language & Version Fix',
    },
    changes: {
      uk: [
        'Виправлено відображення версії (більше не показується хеш коміту замість номера версії).',
        'Додано повноцінні Налаштування: графіка (якість, дощ, частинки, світіння, сканлайни, масштаб), перенастроювання клавіш та тестування музичних треків із гучністю.',
        'Зроблено постійний нікнейм, який зберігається після перезапуску і синхронізується між гравцями в мережі.',
        'Прибрано кнопки «НОВА ВКЛАДКА», а кнопку «ВКЛАДКА» замінено на «ВЕСЬ ЕКРАН».',
        'Додано кнопку «ЧЕНДЖЛОГ» з історією змін та повну підтримку англійської мови з вибором при першому вході.',
        'Слимакокіт на трубі у головному меню тепер змінюється на вибраного персонажа, а після завершення чи скасування їжі персонаж більше не залишається в присяді.',
      ],
      en: [
        'Fixed build version display (no longer overwritten by git commit hash).',
        'Added functional Settings: Graphics presets & toggles, Keybind remapping, Audio volume sliders, and Music Track Tester.',
        'Added persistent player nickname saved across reloads and synced in real time across multiplayer peers.',
        'Removed "New Tab" links and replaced the menu tab button with a Fullscreen toggle.',
        'Added Changelog modal with version notes and full English localization with a first-visit language selector.',
        'Main menu Slugcat now updates to reflect the selected character, and Slugcat stands up properly after finishing or cancelling eating.',
      ],
    },
  },
  {
    version: '1.4.3',
    date: '2026-11-16',
    title: {
      uk: 'Розумніший ШІ ящерів і безшумне автооновлення',
      en: 'Smarter Lizard AI & Silent Auto-Reload',
    },
    changes: {
      uk: [
        'Навчено рожевих ящерів спускатися вниз по жердинах і переслідувати гравця через переходи/труби.',
        'Збільшено памʼять ящерів про позицію здобичі (до 18 секунд).',
        'Замінено системне вікно оновлення на плавний екран «ПЕРЕЗАВАНТАЖЕННЯ...» без діалогів браузера.',
      ],
      en: [
        'Taught Pink Lizards to climb down poles and follow players through shortcut & transition pipes.',
        'Extended lizard prey memory up to 18 seconds.',
        'Replaced browser alert dialogs with a smooth in-game auto-reload overlay on updates.',
      ],
    },
  },
  {
    version: '1.4.2',
    date: '2026-11-14',
    title: {
      uk: 'Персонаж Монах, навігаційна сітка та версіонування кімнат',
      en: 'Monk Slugcat, NavGraph & Room Version Checks',
    },
    changes: {
      uk: [
        'Додано нового слимакокота «Монах» (2 HP, імунітет до хвату зі станом ящера на 5с, ослаблені кидки, 2+4 їжі).',
        'Додано невидиму навігаційну сітку платформ і жердин для пошуку шляху ящерами.',
        'Усунено накладання музики меню та гри, додано перевірку сумісності версій у мультиплеєрі.',
      ],
      en: [
        'Added playable Monk Slugcat (2 HP, bite-grab immunity with 5s attacker stun, weaker throws, 2+4 food pips).',
        'Added waypoint navigation graph along platforms and poles for lizard pathfinding.',
        'Prevented menu/game music overlap and added multiplayer client version checks.',
      ],
    },
  },
];
