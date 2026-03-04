
const { useEffect, useMemo, useRef, useState } = React;
const h = React.createElement;

const STORAGE_KEY = "polga_clicker_save_v1";
const SAVE_VERSION = 1;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function formatNumber(n) {
  if (!Number.isFinite(n)) return "0";
  if (n < 1000) return String(Math.floor(n));
  const units = ["k", "M", "B", "T"];
  let x = n;
  let unit = "";
  for (let i = 0; i < units.length && x >= 1000; i++) {
    x /= 1000;
    unit = units[i];
  }
  const decimals = x < 10 ? 2 : x < 100 ? 1 : 0;
  return `${x.toFixed(decimals)}${unit}`;
}

function nowMs() {
  return Date.now();
}

function safeParseJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function defaultSave() {
  return {
    version: SAVE_VERSION,
    createdAt: nowMs(),
    updatedAt: nowMs(),
    stats: {
      totalClicks: 0,
      totalCoinsEarned: 0,
      thievesCaught: 0,
      highestCoins: 0,
      timePlayedMs: 0,
    },
    settings: {
      reducedMotion: false,
      sfx: true,
    },
    game: {
      coins: 0,
      clickPower: 1,
      combo: 0,
      comboUntilMs: 0,
      district: 0,
      lastTickMs: nowMs(),
      winShown: false,
      shop: {
        clickPower: { level: 0 },
        autoCollector: { level: 0 },
        coinMagnet: { level: 0 },
        luckyStrike: { level: 0 },
      },
      achievements: {},
      activeThief: null, // { id, spawnedAtMs, x, y, hp, expiresAtMs }
      toastQueue: [],
      tutorialSeen: false,
    },
  };
}

function migrateSave(raw) {
  const base = defaultSave();
  if (!raw || typeof raw !== "object") return base;
  if (raw.version !== SAVE_VERSION) {
    // Migration simple: on garde ce qu'on peut, sinon valeurs par défaut.
  }
  const merged = {
    ...base,
    ...raw,
    stats: { ...base.stats, ...(raw.stats || {}) },
    settings: { ...base.settings, ...(raw.settings || {}) },
    game: {
      ...base.game,
      ...(raw.game || {}),
      shop: { ...base.game.shop, ...((raw.game || {}).shop || {}) },
      achievements: { ...base.game.achievements, ...((raw.game || {}).achievements || {}) },
    },
  };
  merged.version = SAVE_VERSION;
  merged.updatedAt = nowMs();
  if (!Number.isFinite(merged.game.coins)) merged.game.coins = 0;
  if (!Number.isFinite(merged.game.clickPower)) merged.game.clickPower = 1;
  merged.game.coins = Math.max(0, merged.game.coins);
  merged.game.clickPower = Math.max(1, merged.game.clickPower);
  return merged;
}

function loadSave() {
  const raw = safeParseJson(localStorage.getItem(STORAGE_KEY) || "");
  return migrateSave(raw);
}

function saveToStorage(save) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    // ignore (quota / mode privé)
  }
}

function useInterval(callback, delayMs) {
  const cbRef = useRef(callback);
  useEffect(() => {
    cbRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delayMs == null) return undefined;
    const id = setInterval(() => cbRef.current(), delayMs);
    return () => clearInterval(id);
  }, [delayMs]);
}

function Button({ onClick, children, variant = "primary", disabled }) {
  return h(
    "button",
    { className: `btn btn--${variant}`, onClick, disabled },
    children
  );
}

function Card({ title, children, footer }) {
  return h(
    "div",
    { className: "card" },
    title ? h("div", { className: "card__title" }, title) : null,
    h("div", { className: "card__body" }, children),
    footer ? h("div", { className: "card__footer" }, footer) : null
  );
}

function ProgressBar({ value, max, label }) {
  const pct = max <= 0 ? 0 : clamp((value / max) * 100, 0, 100);
  return h(
    "div",
    { className: "progress" },
    h("div", { className: "progress__row" }, h("div", { className: "progress__label" }, label), h("div", { className: "progress__value" }, `${Math.floor(pct)}%`)),
    h("div", { className: "progress__track" }, h("div", { className: "progress__fill", style: { width: `${pct}%` } }))
  );
}

function computeShopDef() {
  return {
    clickPower: {
      name: "Sirconcire",
      description: "Augmente les pièces par clic.",
      baseCost: 15,
      costGrowth: 1.55,
      effect: (level) => 1 + level,
    },
    autoCollector: {
      name: "Collecteur auto",
      description: "Gagne des pièces automatiquement.",
      baseCost: 40,
      costGrowth: 1.6,
      effect: (level) => level * 0.6, // coins/sec
    },
    coinMagnet: {
      name: "Aimant à pièces",
      description: "Bonus permanent sur les gains.",
      baseCost: 120,
      costGrowth: 1.75,
      effect: (level) => 1 + level * 0.08, // multiplier
    },
    luckyStrike: {
      name: "Coup chanceux",
      description: "Chance de coup critique (x3) sur clic.",
      baseCost: 200,
      costGrowth: 1.8,
      effect: (level) => clamp(level * 0.03, 0, 0.35), // crit chance
    },
  };
}

function getUpgradeCost(def, level) {
  return Math.floor(def.baseCost * Math.pow(def.costGrowth, level));
}

function getDistrictDef(d) {
  const districts = [
    { name: "Tel‑Avive", target: 250, thiefRate: 0.04 },
    { name: "Jaffa", target: 1200, thiefRate: 0.06 },
    { name: "Haïfa", target: 5000, thiefRate: 0.08 },
    { name: "Nazareth", target: 18000, thiefRate: 0.1 },
    { name: "Eilat", target: 60000, thiefRate: 0.12 },
  ];
  return districts[clamp(d, 0, districts.length - 1)];
}

function maybeUnlockAchievement(save, key, toastText) {
  if (save.game.achievements[key]) return save;
  const next = { ...save, game: { ...save.game, achievements: { ...save.game.achievements, [key]: true } } };
  next.game.toastQueue = [...next.game.toastQueue, { id: `${key}-${nowMs()}`, text: toastText, createdAtMs: nowMs() }];
  return next;
}

function MenuScreen({ canContinue, onContinue, onNewGame, onOpenSettings }) {
  return h(
    "div",
    { className: "screen" },
    h("div", { className: "shell" }, 
      h("div", { className: "brand" },
        h("img", { className: "brand__logo", src: "assets/polga.png", alt: "Polga" }),
        h("div", null, h("div", { className: "brand__title" }, "Polga Clicker"), h("div", { className: "brand__subtitle" }, "Attrape le voleur. Fais monter ton empire de pièces."))
      ),
      h(
        "div",
        { className: "grid" },
        h(
          Card,
          {
            title: "Jouer",
            footer: h("div", { className: "row row--gap" },
              h(Button, { onClick: onNewGame }, "Nouvelle partie"),
              h(Button, { onClick: onContinue, variant: "ghost", disabled: !canContinue }, "Continuer")
            ),
          },
          h("div", { className: "muted" }, "Le jeu se sauvegarde automatiquement sur ton navigateur.")
        ),
        h(
          Card,
          {
            title: "Options",
            footer: h("div", { className: "row row--gap" }, h(Button, { onClick: onOpenSettings, variant: "secondary" }, "Paramètres")),
          },
          h("ul", { className: "list" },
            h("li", null, "Boutique avec upgrades"),
            h("li", null, "Voleur aléatoire à cliquer"),
            h("li", null, "Progression par quartiers"),
            h("li", null, "Succès + statistiques")
          )
        )
      )
    )
  );
}

function SettingsModal({ settings, onClose, onUpdate, onHardReset }) {
  return h(
    "div",
    { className: "modal__backdrop", role: "dialog", "aria-modal": "true" },
    h(
      "div",
      { className: "modal" },
      h("div", { className: "modal__title" }, "Paramètres"),
      h("div", { className: "modal__body" },
        h("label", { className: "check" },
          h("input", { type: "checkbox", checked: !!settings.sfx, onChange: (e) => onUpdate({ ...settings, sfx: e.target.checked }) }),
          h("span", null, "Effets sonores (placeholder)")
        ),
        h("label", { className: "check" },
          h("input", { type: "checkbox", checked: !!settings.reducedMotion, onChange: (e) => onUpdate({ ...settings, reducedMotion: e.target.checked }) }),
          h("span", null, "Réduire les animations")
        ),
        h("div", { className: "divider" }),
        h("div", { className: "muted" }, "Tu peux réinitialiser la sauvegarde si besoin.")
      ),
      h("div", { className: "modal__footer row row--gap row--between" },
        h(Button, { onClick: onHardReset, variant: "danger" }, "Réinitialiser"),
        h("div", { className: "row row--gap" },
          h(Button, { onClick: onClose, variant: "ghost" }, "Fermer")
        )
      )
    )
  );
}

function Toasts({ items }) {
  return h(
    "div",
    { className: "toasts", "aria-live": "polite" },
    items.map((t) => h("div", { key: t.id, className: "toast" }, t.text))
  );
}

function TutorialOverlay({ onClose }) {
  return h(
    "div",
    { className: "tutorial", role: "dialog", "aria-modal": "true" },
    h(
      "div",
      { className: "tutorial__card" },
      h("div", { className: "tutorial__title" }, "Comment jouer à Polga Clicker ?"),
      h(
        "ol",
        { className: "tutorial__list" },
        h("li", null, "Tape / clique sur l'étoile au centre pour gagner des pièces."),
        h("li", null, "Avec les pièces, achète des améliorations dans la boutique à droite."),
        h("li", null, "Un voleur peut apparaître sur la zone de jeu : tape dessus très vite pour gagner un bonus."),
        h("li", null, "Atteins l'objectif de pièces de chaque quartier pour débloquer le suivant."),
        h("li", null, "Plus tu joues, plus tu débloques de succès et deviens une légende de la Polga.")
      ),
      h(
        "div",
        { className: "tutorial__actions" },
        h(
          Button,
          { onClick: onClose, variant: "primary" },
          "C'est parti !"
        )
      )
    )
  );
}

function AchievementPanel({ achievements }) {
  const defs = [
    { key: "firstClick", name: "Premier clic", desc: "Cliquer 1 fois." },
    { key: "hundredCoins", name: "Petit magot", desc: "Atteindre 100 pièces." },
    { key: "firstUpgrade", name: "Optimisation", desc: "Acheter un upgrade." },
    { key: "catchThief", name: "Justicier", desc: "Attraper un voleur." },
    { key: "district2", name: "Explorateur", desc: "Débloquer Jaffa." },
    { key: "win", name: "Légende", desc: "Atteindre la fin." },
  ];
  return h(
    "div",
    { className: "achievements" },
    defs.map((a) =>
      h(
        "div",
        { key: a.key, className: `ach ${achievements[a.key] ? "ach--done" : ""}` },
        h("div", { className: "ach__name" }, a.name),
        h("div", { className: "ach__desc" }, a.desc)
      )
    )
  );
}

function GameScreen({ save, setSave, onBackToMenu }) {
  const shopDef = useMemo(() => computeShopDef(), []);

  const [showTutorial, setShowTutorial] = useState(() => !save.game.tutorialSeen);

  const [clickBursts, setClickBursts] = useState([]);

  const isMobile = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent || ""
      ),
    []
  );

  const district = getDistrictDef(save.game.district);

  const clickPower = useMemo(() => {
    const lvl = save.game.shop.clickPower.level || 0;
    return Math.max(1, shopDef.clickPower.effect(lvl));
  }, [save.game.shop.clickPower.level, shopDef.clickPower]);

  const coinsMultiplier = useMemo(() => {
    const lvl = save.game.shop.coinMagnet.level || 0;
    return Math.max(1, shopDef.coinMagnet.effect(lvl));
  }, [save.game.shop.coinMagnet.level, shopDef.coinMagnet]);

  const autoCoinsPerSec = useMemo(() => {
    const lvl = save.game.shop.autoCollector.level || 0;
    return Math.max(0, shopDef.autoCollector.effect(lvl));
  }, [save.game.shop.autoCollector.level, shopDef.autoCollector]);

  const critChance = useMemo(() => {
    const lvl = save.game.shop.luckyStrike.level || 0;
    return clamp(shopDef.luckyStrike.effect(lvl), 0, 0.75);
  }, [save.game.shop.luckyStrike.level, shopDef.luckyStrike]);

  const districtTarget = district.target;
  const districtProgress = clamp(save.game.coins, 0, districtTarget);

  function pushToast(text) {
    setSave((prev) => {
      const next = { ...prev, game: { ...prev.game } };
      next.game.toastQueue = [...next.game.toastQueue, { id: `t-${nowMs()}-${Math.random()}`, text, createdAtMs: nowMs() }];
      return next;
    });
  }

  function awardCoins(amount) {
    setSave((prev) => {
      const next = { ...prev, stats: { ...prev.stats }, game: { ...prev.game } };
      next.game.coins = Math.max(0, (next.game.coins || 0) + amount);
      next.stats.totalCoinsEarned = (next.stats.totalCoinsEarned || 0) + Math.max(0, amount);
      next.stats.highestCoins = Math.max(next.stats.highestCoins || 0, next.game.coins);
      next.updatedAt = nowMs();
      return next;
    });
  }

  function handleClick(e) {
    const t = nowMs();

    if (e && e.currentTarget && typeof e.clientX === "number") {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      const id = `cb-${t}-${Math.random()}`;
      setClickBursts((prev) => [...prev, { id, x, y }]);
      setTimeout(() => {
        setClickBursts((prev) => prev.filter((b) => b.id !== id));
      }, 450);
    }

    setSave((prev) => {
      const next = { ...prev, stats: { ...prev.stats }, game: { ...prev.game } };
      next.stats.totalClicks = (next.stats.totalClicks || 0) + 1;

      const withinCombo = (next.game.comboUntilMs || 0) > t;
      const combo = withinCombo ? (next.game.combo || 0) + 1 : 1;
      next.game.combo = combo;
      next.game.comboUntilMs = t + 1500;

      const comboBonus = 1 + Math.min(0.5, combo * 0.02);
      const isCrit = Math.random() < critChance;
      const critMult = isCrit ? 3 : 1;
      const earned = Math.floor(clickPower * coinsMultiplier * comboBonus * critMult);

      next.game.coins = (next.game.coins || 0) + earned;
      next.stats.totalCoinsEarned = (next.stats.totalCoinsEarned || 0) + earned;
      next.stats.highestCoins = Math.max(next.stats.highestCoins || 0, next.game.coins);
      next.updatedAt = t;

      try {
        if (isCrit && typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(30);
        }
      } catch {
        // ignore
      }

      if (next.stats.totalClicks >= 1) {
        return maybeUnlockAchievement(next, "firstClick", "Succès débloqué : Premier clic");
      }
      return next;
    });
  }

  function buyUpgrade(key) {
    const def = shopDef[key];
    setSave((prev) => {
      const currentLevel = (prev.game.shop[key]?.level || 0);
      const cost = getUpgradeCost(def, currentLevel);
      if ((prev.game.coins || 0) < cost) return prev;

      const next = { ...prev, game: { ...prev.game, shop: { ...prev.game.shop } } };
      next.game.coins = (next.game.coins || 0) - cost;
      next.game.shop[key] = { ...next.game.shop[key], level: currentLevel + 1 };
      next.updatedAt = nowMs();

      let withAch = maybeUnlockAchievement(next, "firstUpgrade", "Succès débloqué : Optimisation");
      return withAch;
    });
    pushToast(`${def.name} amélioré !`);
  }

  function spawnThiefIfNeeded() {
    setSave((prev) => {
      if (prev.game.activeThief) return prev;
      const chance = district.thiefRate;
      if (Math.random() > chance) return prev;

      const id = `th-${nowMs()}-${Math.random()}`;
      const next = { ...prev, game: { ...prev.game } };
      next.game.activeThief = {
        id,
        spawnedAtMs: nowMs(),
        expiresAtMs: nowMs() + 5000,
        hp: 1,
        x: 12 + Math.random() * 76,
        y: 20 + Math.random() * 55,
      };
      next.game.toastQueue = [...next.game.toastQueue, { id: `t-${id}`, text: "Un voleur apparaît ! Clique vite.", createdAtMs: nowMs() }];
      return next;
    });
  }

  function clickThief() {
    setSave((prev) => {
      const th = prev.game.activeThief;
      if (!th) return prev;
      const next = { ...prev, stats: { ...prev.stats }, game: { ...prev.game } };
      next.game.activeThief = null;
      next.stats.thievesCaught = (next.stats.thievesCaught || 0) + 1;
      next.updatedAt = nowMs();
      const bounty = Math.floor(25 * coinsMultiplier);
      next.game.coins = (next.game.coins || 0) + bounty;
      next.stats.totalCoinsEarned = (next.stats.totalCoinsEarned || 0) + bounty;
      next.game.toastQueue = [...next.game.toastQueue, { id: `t-catch-${nowMs()}`, text: `Voleur attrapé ! +${bounty} pièces`, createdAtMs: nowMs() }];
      let withAch = maybeUnlockAchievement(next, "catchThief", "Succès débloqué : Justicier");
      try {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate([20, 40, 30]);
        }
      } catch {
        // ignore
      }
      return withAch;
    });
  }

  function tick() {
    const t = nowMs();
    setSave((prev) => {
      const next = { ...prev, stats: { ...prev.stats }, game: { ...prev.game } };

      const last = Number.isFinite(next.game.lastTickMs) ? next.game.lastTickMs : t;
      const dtMs = clamp(t - last, 0, 60000);
      next.game.lastTickMs = t;
      next.stats.timePlayedMs = (next.stats.timePlayedMs || 0) + dtMs;

      const autoGain = autoCoinsPerSec * (dtMs / 1000) * coinsMultiplier;
      if (autoGain > 0) {
        const earned = Math.floor(autoGain);
        if (earned > 0) {
          next.game.coins = (next.game.coins || 0) + earned;
          next.stats.totalCoinsEarned = (next.stats.totalCoinsEarned || 0) + earned;
          next.stats.highestCoins = Math.max(next.stats.highestCoins || 0, next.game.coins);
        }
      }

      // Gestion du voleur
      if (next.game.activeThief && (next.game.activeThief.expiresAtMs || 0) <= t) {
        const steal = Math.max(5, Math.floor((next.game.coins || 0) * 0.08));
        next.game.coins = Math.max(0, (next.game.coins || 0) - steal);
        next.game.activeThief = null;
        next.game.toastQueue = [...next.game.toastQueue, { id: `t-steal-${nowMs()}`, text: `Le voleur s'échappe... -${steal} pièces`, createdAtMs: nowMs() }];
      }

      // Nettoyage toasts (>3.5s)
      const cutoff = t - 3500;
      next.game.toastQueue = (next.game.toastQueue || []).filter((x) => (x.createdAtMs || 0) >= cutoff).slice(-4);

      // Achievements & progression
      let evolved = next;
      if ((evolved.game.coins || 0) >= 100) evolved = maybeUnlockAchievement(evolved, "hundredCoins", "Succès débloqué : Petit magot");

      const districtNow = getDistrictDef(evolved.game.district);
      if ((evolved.game.coins || 0) >= districtNow.target && evolved.game.district < 4) {
        evolved = { ...evolved, game: { ...evolved.game, district: evolved.game.district + 1 } };
        const nextDistrict = getDistrictDef(evolved.game.district);
        evolved.game.toastQueue = [...evolved.game.toastQueue, { id: `t-d-${nowMs()}`, text: `Nouveau quartier : ${nextDistrict.name}`, createdAtMs: nowMs() }];
        if (evolved.game.district >= 1) evolved = maybeUnlockAchievement(evolved, "district2", "Succès débloqué : Explorateur");
      }

      const winCoins = 100000;
      if (!evolved.game.winShown && (evolved.game.coins || 0) >= winCoins) {
        evolved = { ...evolved, game: { ...evolved.game, winShown: true } };
        evolved = maybeUnlockAchievement(evolved, "win", "Succès débloqué : Légende");
        evolved.game.toastQueue = [...evolved.game.toastQueue, { id: `t-win-${nowMs()}`, text: "Victoire ! Tu as terminé Polga Clicker.", createdAtMs: nowMs() }];
      }

      evolved.updatedAt = t;
      return evolved;
    });

    // Spawn thief "hors state" pour éviter de dépendances
    if (Math.random() < 0.25) spawnThiefIfNeeded();
  }

  useInterval(tick, 250);

  const upgrades = Object.keys(shopDef).map((key) => {
    const def = shopDef[key];
    const level = save.game.shop[key]?.level || 0;
    const cost = getUpgradeCost(def, level);
    const affordable = save.game.coins >= cost;
    return { key, def, level, cost, affordable };
  });

  return h(
    "div",
    { className: "screen" },
    h("div", { className: "shell shell--game" },
      h("header", { className: "topbar" },
        h("div", { className: "topbar__left" },
          h(Button, { onClick: onBackToMenu, variant: "ghost" }, "Menu"),
          h("div", { className: "badge" }, district.name)
        ),
        h("div", { className: "topbar__right" },
          h("div", { className: "stat" }, h("div", { className: "stat__label" }, "Pièces"), h("div", { className: "stat__value" }, formatNumber(save.game.coins))),
          h("div", { className: "stat" }, h("div", { className: "stat__label" }, "Par clic"), h("div", { className: "stat__value" }, formatNumber(clickPower * coinsMultiplier))),
          h("div", { className: "stat" }, h("div", { className: "stat__label" }, "Auto/s"), h("div", { className: "stat__value" }, formatNumber(autoCoinsPerSec * coinsMultiplier)))
        )
      ),

      h("div", { className: "gameGrid" },
        h(
          "div",
          { className: "playArea" },
          h(
            "div",
            { className: "clicker" },
            h(
              "button",
              {
                className: "clicker__target",
                onClick: (e) => handleClick(e),
                "aria-label": "Cliquer pour gagner des pièces",
              },
              h("img", {
                src: "assets/polga.png",
                alt: "Polga",
                className: "clicker__img",
                draggable: "false",
              })
            ),
            clickBursts.map((b) =>
              h("div", {
                key: b.id,
                className: "clickBurst",
                style: { left: `${b.x}%`, top: `${b.y}%` },
              })
            ),
            h("div", { className: "row row--gap row--center" },
              h("div", { className: "pill" }, `Combo: x${save.game.combo || 0}`),
              h("div", { className: "pill pill--sub" }, `Crit: ${Math.floor(critChance * 100)}%`)
            ),
            h(ProgressBar, { value: districtProgress, max: districtTarget, label: `Objectif quartier: ${formatNumber(districtTarget)}` }),
            save.game.winShown
              ? h("div", { className: "winbox" }, h("div", { className: "winbox__title" }, "Victoire !"), h("div", { className: "muted" }, "Tu peux continuer à jouer ou recommencer depuis le menu."))
              : null
          ),

          save.game.activeThief
            ? h(
                "button",
                {
                  className: "thief",
                  onClick: clickThief,
                  style: { left: `${save.game.activeThief.x}%`, top: `${save.game.activeThief.y}%` },
                  title: "Voleur !",
                },
                h("img", { src: "assets/thief.svg", alt: "Voleur", className: "thief__img", draggable: "false" })
              )
            : null
        ),

        h(
          "aside",
          { className: "side" },
          h(
            Card,
            { title: "Boutique" },
            h(
              "div",
              { className: "shop" },
              upgrades.map((u) =>
                h(
                  "div",
                  { key: u.key, className: `shopItem ${u.affordable ? "" : "shopItem--locked"}` },
                  h("div", { className: "shopItem__head" },
                    h("div", { className: "shopItem__name" }, u.def.name),
                    h("div", { className: "shopItem__lvl" }, `Nv. ${u.level}`)
                  ),
                  h("div", { className: "shopItem__desc" }, u.def.description),
                  h("div", { className: "shopItem__actions" },
                    h("div", { className: "shopItem__cost" }, `Coût: ${formatNumber(u.cost)}`),
                    h(Button, { onClick: () => buyUpgrade(u.key), variant: u.affordable ? "primary" : "ghost", disabled: !u.affordable }, "Acheter")
                  )
                )
              )
            )
          ),

          h(
            Card,
            { title: "Succès" },
            h(AchievementPanel, { achievements: save.game.achievements || {} })
          ),

          h(
            Card,
            { title: "Stats" },
            h("div", { className: "statsGrid" },
              h("div", { className: "miniStat" }, h("div", { className: "miniStat__label" }, "Clics"), h("div", { className: "miniStat__value" }, formatNumber(save.stats.totalClicks || 0))),
              h("div", { className: "miniStat" }, h("div", { className: "miniStat__label" }, "Pièces totales"), h("div", { className: "miniStat__value" }, formatNumber(save.stats.totalCoinsEarned || 0))),
              h("div", { className: "miniStat" }, h("div", { className: "miniStat__label" }, "Voleurs"), h("div", { className: "miniStat__value" }, formatNumber(save.stats.thievesCaught || 0))),
              h("div", { className: "miniStat" }, h("div", { className: "miniStat__label" }, "Record"), h("div", { className: "miniStat__value" }, formatNumber(save.stats.highestCoins || 0)))
            )
          )
        )
      ),

      h(Toasts, { items: save.game.toastQueue || [] })
    ),
    showTutorial
      ? h(TutorialOverlay, {
          onClose: () => {
            setShowTutorial(false);
            setSave((prev) => ({
              ...prev,
              game: { ...prev.game, tutorialSeen: true },
            }));
          },
        })
      : null
  );
}

function App() {
  const [route, setRoute] = useState("menu"); // menu | game
  const [save, setSave] = useState(() => loadSave());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const canContinue = (save.stats.totalClicks || 0) > 0 || (save.game.coins || 0) > 0;

  // Autosave
  useEffect(() => {
    saveToStorage(save);
  }, [save]);

  // Persist "online" time tick safety: keep updatedAt moving a bit
  useInterval(() => {
    setSave((prev) => ({ ...prev, updatedAt: nowMs() }));
  }, 4000);

  function newGame() {
    const fresh = defaultSave();
    saveToStorage(fresh);
    setSave(fresh);
    setRoute("game");
  }

  function continueGame() {
    setRoute("game");
  }

  function hardReset() {
    const fresh = defaultSave();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setSave(fresh);
    setRoute("menu");
    setSettingsOpen(false);
  }

  return h(
    React.Fragment,
    null,
    route === "menu"
      ? h(MenuScreen, {
          canContinue,
          onContinue: continueGame,
          onNewGame: newGame,
          onOpenSettings: () => setSettingsOpen(true),
        })
      : h(GameScreen, { save, setSave, onBackToMenu: () => setRoute("menu") }),
    settingsOpen
      ? h(SettingsModal, {
          settings: save.settings,
          onClose: () => setSettingsOpen(false),
          onUpdate: (nextSettings) => setSave((prev) => ({ ...prev, settings: nextSettings })),
          onHardReset: hardReset,
        })
      : null
  );
}

const rootElement = document.getElementById("root");
const root = ReactDOM.createRoot(rootElement);
root.render(h(App));



