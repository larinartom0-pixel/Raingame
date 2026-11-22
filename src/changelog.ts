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
