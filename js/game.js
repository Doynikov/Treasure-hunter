/**
 * Treasure Hunter — основной игровой цикл.
 *
 * Идея камеры: персонаж всегда стоит на одном месте экрана,
 * а «идёт» за счёт прокрутки фона (side-scroller с фиксированным героем).
 *
 * Мировые координаты в пикселях совпадают с bgOffset:
 * чем больше bgOffset, тем дальше мы «ушли» вправо по коридору.
 * Экранная X объекта = worldX - bgOffset.
 */

// ---------------------------------------------------------------------------
// Константы сцены и движения
// ---------------------------------------------------------------------------

/** Ширина игрового поля в пикселях (совпадает с атрибутом canvas). */
const WIDTH = 1280;
/** Высота игрового поля в пикселях. */
const HEIGHT = 720;

/**
 * Скорость прокрутки фона (пикселей в секунду).
 * Чем больше значение, тем быстрее «идёт» охотник.
 */
const SCROLL_SPEED = 280;

/**
 * Сколько пикселей bgOffset соответствует одному метру пути.
 * В HUD: путь = bgOffset / PX_PER_METER.
 */
const PX_PER_METER = 10;

/**
 * Минимальный и максимальный зазор между соседними перегородками (в метрах).
 * Следующая стена ставится случайно в этом диапазоне после предыдущей.
 */
const WALL_MIN_GAP_M = 150;
const WALL_MAX_GAP_M = 300;

/** Сколько столбцов каменных блоков в толщине перегородки. */
const WALL_COLS = 2;
/** Сколько рядов блоков по высоте (стена на весь экран). */
const WALL_ROWS = 6;
/** Ширина одного каменного блока в пикселях. */
const BLOCK_W = 54;
/** Высота одного ряда блоков (последний ряд подгоняется под HEIGHT). */
const BLOCK_H = Math.ceil(HEIGHT / WALL_ROWS);
/** Полная толщина перегородки = столбцы × ширина блока. */
const WALL_THICKNESS = WALL_COLS * BLOCK_W;

/**
 * Экранная X-координата центра охотника.
 * Персонаж не ездит по экрану — двигается только фон.
 */
const HUNTER_SCREEN_X = WIDTH * 0.28;
/** Высота спрайта охотника при отрисовке. */
const HUNTER_DRAW_H = 210;
/**
 * Приблизительная половина ширины тела (для коллизии со стеной).
 * Коэффициент 0.55 — чуть уже спрайта, чтобы упор выглядел естественнее.
 */
const HUNTER_HALF_W = (HUNTER_DRAW_H * 0.55) / 2;
/** Уровень «пола», от которого отсчитывается постановка ног персонажа. */
const GROUND_Y = HEIGHT - 70;
/** Центр овала тени по Y (пол / точка опоры ступней). */
const SHADOW_CENTER_Y = GROUND_Y + 28;

/** Длительность анимации «нагнуться и положить динамит» (секунды). */
const PLACE_DYNAMITE_DURATION = 0.85;
/** Насколько далеко перед охотником кладётся динамит (пиксели мира / экрана). */
const DYNAMITE_PLACE_OFFSET = 55;
/** Размер динамита на экране (большая сторона, px) — один и тот же в руках и на земле. */
const DYNAMITE_SIZE = 30;
/** Через сколько секунд после укладки срабатывает взрыв. */
const DYNAMITE_FUSE_TIME = 3;
/** Длительность анимации вспышки взрыва (секунды). */
const EXPLOSION_DURATION = 0.55;
/** Базовый размер спрайта взрыва (px). */
const EXPLOSION_SIZE = 220;
/**
 * Радиус поражения стены динамитом (в метрах).
 * Если заряд ближе — после взрыва перегородка разрушается.
 */
const WALL_BLAST_RADIUS_M = 1;
/**
 * Радиус смертельного поражения охотника (в метрах).
 * Если персонаж ближе — после взрыва он умирает.
 */
const DEATH_BLAST_RADIUS_M = 30;

/** Интервал между висящими летучими мышами на потолке (метры). */
const BAT_GAP_M = 60;
/** На каком расстоянии (м) мышь срывается с потолка. */
const BAT_AGGRO_M = 50;
/** Размер висящей мыши на экране. */
const BAT_SIZE = 70;
/** Размер летящей мыши. */
const BAT_FLY_SIZE = 70;
/** Высота потолка (Y цепляния). */
const BAT_CEILING_Y = 36;
/** Длительность полёта по параболе (сек). */
const BAT_FLY_DURATION = 1.35;
/** На сколько метров назад отбрасывает удар летучей мыши. */
const BAT_KNOCKBACK_M = 500;
/** Скорость перетаскивания мышью назад (пикселей мира в секунду). */
const BAT_DRAG_SPEED = 840;

/** Случайный зазор между ямами с кольями в полу (метры). */
const PIT_MIN_GAP_M = 160;
const PIT_MAX_GAP_M = 200;
/** Размер ямы на экране (px). */
const PIT_DRAW_W = 488;
const PIT_DRAW_H = 112;
/** Длительность провала в яму (сек). */
const PIT_FALL_DURATION = 0.75;
/** Запас ниже нижнего края канваса, чтобы спрайт полностью скрылся. */
const PIT_SINK_BELOW_CANVAS = 32;

// ---------------------------------------------------------------------------
// Canvas и состояние игры
// ---------------------------------------------------------------------------

const canvas = document.getElementById("game");
/** 2D-контекст: все draw* рисуют именно сюда. */
const ctx = canvas.getContext("2d");

/**
 * Набор нажатых клавиш (в нижнем регистре).
 * Используем Set, чтобы одновременно учитывать несколько клавиш
 * и не зависеть от автоповтора keydown.
 */
const keys = new Set();

/**
 * Смещение камеры / пройденный путь в пикселях мира.
 * 0 — старт; увеличение = движение вправо по коридору.
 */
let bgOffset = 0;

/**
 * Направление взгляда спрайта: 1 — вправо, -1 — влево.
 * Меняется при движении, чтобы охотник «смотрел» куда идёт.
 */
let facing = 1;

/**
 * Фаза анимации ходьбы (накапливается при движении).
 * Чётный/нечётный шаг → спрайт левой / правой ноги.
 */
let walkPhase = 0;

/** true — игра на паузе (Esc), update не двигает мир. */
let paused = false;

/** Время предыдущего кадра (performance.now / rAF timestamp) для расчёта dt. */
let lastTime = 0;

/**
 * true — охотник упёрся лицом в ближайшую перегородку
 * и не может двигаться вперёд (вправо).
 */
let blockedByWall = false;

/** true — охотник погиб от взрыва; управление заблокировано. */
let dead = false;

/** Активный провал в яму или null: { pit, elapsed }. */
let pitFall = null;

/** Смерть в яме — для отрисовки «по горло» (после окончания падения). */
let pitDeath = null;

/**
 * Активное перетаскивание мышью назад или null.
 * { remainingPx } — сколько пикселей мира ещё тащить.
 */
let batDrag = null;

/** Область кнопки «Начать заново» на экране смерти (для клика). */
let restartBtn = null;

/**
 * Текущая анимация укладки динамита или null.
 * { elapsed } — сколько секунд длится наклон.
 * Динамит на земле появляется только после конца анимации (когда охотник снова стоит).
 */
let placeAction = null;

/**
 * Метрики спрайтов больше не читаем через getImageData —
 * при file:// / локальной загрузке canvas «заражался» (CORS) и падал с SecurityError.
 * Спрайты подготовлены на холсте 220×220 с ногами у нижнего края.
 */

/**
 * Перегородки: { worldX, destroyed }.
 * worldX — левая грань в пикселях мира; destroyed — разрушена взрывом.
 */
const walls = [];

/**
 * Положенные заряды динамита в мире:
 * { worldX, age, exploded } — позиция, возраст (сек), уже взорвался ли.
 */
const dynamites = [];

/**
 * Активные вспышки взрыва:
 * { worldX, elapsed } — центр взрыва и время с момента детонации.
 */
const explosions = [];

/**
 * Летучие мыши:
 * hanging — на потолке; flying — по параболе y = headY + a*(x - vertexX)^2
 * (нижняя точка — голова охотника); gone — улетела.
 */
const bats = [];

/**
 * Ямы с кольями в полу: { worldX } — центр ямы в мире.
 */
const spikePits = [];

/** Загруженные картинки: фон, охотник, динамит, взрыв, мыши, яма. */
const assets = {
  bg: loadImage("assets/images/pyramid-dungeon-bg.jpg"),
  hunter: loadImage("assets/images/hunter-idle.png"),
  hunterWalkLeft: loadImage("assets/images/hunter-walk-left.png"),
  hunterWalkRight: loadImage("assets/images/hunter-walk-right.png"),
  hunterPlace: loadImage("assets/images/hunter-place.png"),
  hunterCrouch: loadImage("assets/images/hunter-crouch.png"),
  hunterDead: loadImage("assets/images/hunter-dead.png"),
  hunterFly: loadImage("assets/images/hunter-fly.png"),
  dynamite: loadImage("assets/images/dynamite.png"),
  explosion: loadImage("assets/images/explosion.png"),
  batHang: loadImage("assets/images/bat.png"),
  batFly: loadImage("assets/images/bat-fly.png"),
  spikePit: loadImage("assets/images/spike-pit.png"),
};

/** Сколько шагов (смен спрайта) в секунду при ходьбе. */
const WALK_FPS = 6;

/**
 * Создаёт Image и сразу начинает загрузку по URL.
 * Готовность проверяется отдельно через assetsReady().
 */
function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

/**
 * Все ассеты загружены и имеют ненулевой размер.
 * Пока false — показываем экран «Загрузка…».
 */
function assetsReady() {
  return Object.values(assets).every((img) => img.complete && img.naturalWidth > 0);
}

/**
 * Размер отрисовки динамита (одинаковый в руках и на земле).
 * Большая сторона = DYNAMITE_SIZE.
 */
function getDynamiteDrawSize() {
  const img = assets.dynamite;
  const nw = img.naturalWidth || 1;
  const nh = img.naturalHeight || 1;
  const scale = DYNAMITE_SIZE / Math.max(nw, nh);
  return { drawW: nw * scale, drawH: nh * scale, img };
}

/**
 * Рисует спрайт динамита в экранных координатах (центр по X, низ у ground-ish).
 */
function drawDynamiteSprite(screenX, groundY) {
  const { drawW, drawH, img } = getDynamiteDrawSize();
  if (!img.naturalWidth) return;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.beginPath();
  ctx.ellipse(screenX, groundY + 4, drawW * 0.4, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.drawImage(img, screenX - drawW / 2, groundY - drawH + 2, drawW, drawH);
}

/**
 * Случайный зазор до следующей стены в метрах
 * в диапазоне [WALL_MIN_GAP_M, WALL_MAX_GAP_M).
 */
function randomGapMeters() {
  return WALL_MIN_GAP_M + Math.random() * (WALL_MAX_GAP_M - WALL_MIN_GAP_M);
}

/**
 * Гарантирует, что впереди (примерно на 2 экрана вперёд)
 * уже сгенерированы перегородки.
 *
 * Логика: берём последнюю известную стену (или 0) и пока её
 * worldX меньше «горизонта генерации», добавляем новую стену
 * на расстоянии randomGapMeters() * PX_PER_METER.
 */
function ensureWallsAhead() {
  const aheadPx = bgOffset + WIDTH * 2;
  let lastWallPx = walls.length ? walls[walls.length - 1].worldX : 0;

  while (lastWallPx < aheadPx) {
    const gapPx = randomGapMeters() * PX_PER_METER;
    lastWallPx += gapPx;
    walls.push({ worldX: lastWallPx, destroyed: false });
  }
}

/**
 * Уровень подбородка СТОЯЩЕГО охотника (дно параболы мыши).
 * Учитывает сдвиг спрайта (+12) и типичную долю роста до подбородка.
 */
function getStandingChinY() {
  const feetY = SHADOW_CENTER_Y + 12;
  return feetY - HUNTER_DRAW_H * 0.68;
}

/**
 * Генерирует висящих мышей впереди строго каждые BAT_GAP_M метров.
 */
function ensureBatsAhead() {
  const aheadPx = bgOffset + WIDTH * 2;
  let lastBatPx = bats.length ? bats[bats.length - 1].worldX : 0;
  const gapPx = BAT_GAP_M * PX_PER_METER;

  while (lastBatPx < aheadPx) {
    lastBatPx += gapPx;
    bats.push({
      worldX: lastBatPx,
      state: "hanging",
      flyT: 0,
      startX: 0,
      endX: 0,
      vertexX: 0,
      chinY: 0,
      parabolaA: 0,
      facing: -1,
      hitHunter: false,
    });
  }
}

function randomPitGapMeters() {
  return PIT_MIN_GAP_M + Math.random() * (PIT_MAX_GAP_M - PIT_MIN_GAP_M);
}

/** Границы ямы в мире (worldX — центр). */
function getPitBounds(centerX) {
  const halfW = PIT_DRAW_W / 2;
  return { left: centerX - halfW, right: centerX + halfW };
}

/** Пересекается ли яма с перегородкой. */
function pitIntersectsWall(centerX, wall) {
  if (wall.destroyed) return false;
  const pit = getPitBounds(centerX);
  const wallLeft = wall.worldX;
  const wallRight = wall.worldX + WALL_THICKNESS;
  return pit.left < wallRight && pit.right > wallLeft;
}

/**
 * Сдвигает центр ямы так, чтобы она целиком была
 * ДО или ПОСЛЕ каждой перегородки (без пересечения).
 */
function placePitClearOfWalls(desiredCenter) {
  let center = desiredCenter;
  const halfW = PIT_DRAW_W / 2;
  const margin = 12;
  let changed = true;
  let safety = 0;

  while (changed && safety++ < 64) {
    changed = false;
    for (const wall of walls) {
      if (!pitIntersectsWall(center, wall)) continue;

      const wallLeft = wall.worldX;
      const wallRight = wall.worldX + WALL_THICKNESS;
      const beforeCenter = wallLeft - halfW - margin;
      const afterCenter = wallRight + halfW + margin;

      // Ставим на ближайшую сторону от желаемой позиции
      if (Math.abs(beforeCenter - desiredCenter) <= Math.abs(afterCenter - desiredCenter)) {
        center = beforeCenter;
      } else {
        center = afterCenter;
      }
      changed = true;
      break;
    }
  }

  return center;
}

/**
 * Генерирует ямы с кольями впереди (случайный шаг 160–200 м).
 * Яма не пересекает перегородку — только целиком до или после неё.
 */
function ensureSpikePitsAhead() {
  ensureWallsAhead();
  const aheadPx = bgOffset + WIDTH * 2;
  let lastPitPx = spikePits.length ? spikePits[spikePits.length - 1].worldX : 0;

  while (lastPitPx < aheadPx) {
    lastPitPx += randomPitGapMeters() * PX_PER_METER;
    const center = placePitClearOfWalls(lastPitPx);
    spikePits.push({ worldX: center });
    lastPitPx = center;
  }
}

/**
 * Рисует ямы с кольями по нижнему краю экрана (488×112).
 */
function drawSpikePits() {
  ensureSpikePitsAhead();
  const img = assets.spikePit;
  if (!img.naturalWidth) return;

  const drawW = PIT_DRAW_W;
  const drawH = PIT_DRAW_H;

  for (const pit of spikePits) {
    const screenX = pit.worldX - bgOffset;
    if (screenX < -drawW || screenX > WIDTH + drawW) continue;

    // Нижний край спрайта = нижний край экрана
    const x = screenX - drawW / 2;
    const y = HEIGHT - drawH;
    ctx.drawImage(img, x, y, drawW, drawH);
  }
}

/** Охотник на линии движения (на полу, не в воздухе). */
function isHunterOnGroundLine() {
  return !isBatDragging();
}

/** Яма под ногами охотника (центр тела над проёмом). */
function getPitUnderHunter() {
  const hunterX = getHunterWorldX();
  const innerMargin = PIT_DRAW_W * 0.14;

  for (const pit of spikePits) {
    const bounds = getPitBounds(pit.worldX);
    if (hunterX > bounds.left + innerMargin && hunterX < bounds.right - innerMargin) {
      return pit;
    }
  }
  return null;
}

/** На сколько опустить спрайт, чтобы он целиком ушёл за нижний край канваса. */
function getPitSinkTargetPx(hunter) {
  const imgH = hunter.naturalHeight || 1;
  const scale = HUNTER_DRAW_H / imgH;
  const drawH = imgH * scale;
  const feetPad = getSpriteFeetPadPx(hunter) * scale;
  const topY = SHADOW_CENTER_Y - drawH + feetPad + 12;
  return HEIGHT - topY + PIT_SINK_BELOW_CANVAS;
}

/** Прогресс провала 0…1 (с ускорением вниз). */
function getPitSinkProgress() {
  if (pitFall) {
    const t = Math.min(1, pitFall.elapsed / PIT_FALL_DURATION);
    return t * t * t;
  }
  if (pitDeath) return 1;
  return 0;
}

function getPitSinkPx(hunter) {
  return getPitSinkTargetPx(hunter) * getPitSinkProgress();
}

/** Начинает провал в яму. */
function startPitFall(pit) {
  pitFall = { pit, elapsed: 0 };
  placeAction = null;
}

/** Тикает анимацию провала; по завершении — смерть. */
function updatePitFall(dt) {
  if (!pitFall) return;

  pitFall.elapsed += dt;
  if (pitFall.elapsed >= PIT_FALL_DURATION) {
    pitDeath = { pit: pitFall.pit };
    pitFall = null;
    dead = true;
    placeAction = null;
  }
}

/** Проверяет, не пора ли провалиться в яму под ногами. */
function checkPitFall() {
  if (dead || pitFall || !isHunterOnGroundLine() || isPlacingDynamite()) return;
  const pit = getPitUnderHunter();
  if (pit) startPitFall(pit);
}

/**
 * Точка на параболе полёта:
 * x идёт линейно start→end;
 * y = chinY - a*(x - vertexX)^2
 * (дно параболы — подбородок стоящего охотника).
 */
function batParabolaPoint(bat, t) {
  const x = bat.startX + (bat.endX - bat.startX) * t;
  const dx = x - bat.vertexX;
  const y = bat.chinY - bat.parabolaA * dx * dx;
  return { x, y };
}

/**
 * Срывает мышь с потолка: парабола с нижней точкой на подбородке стоящего.
 */
function startBatDive(bat) {
  const hunterX = getHunterWorldX();
  const chinY = getStandingChinY();
  const startX = bat.worldX;
  const endX = hunterX - WIDTH * 0.5;
  const dx0 = startX - hunterX;
  // ceilingY = chinY - a*dx0^2  →  a = (chinY - ceilingY) / dx0^2
  const parabolaA = (chinY - BAT_CEILING_Y) / Math.max(dx0 * dx0, 1);

  bat.state = "flying";
  bat.flyT = 0;
  bat.startX = startX;
  bat.endX = endX;
  bat.vertexX = hunterX;
  bat.chinY = chinY;
  bat.parabolaA = parabolaA;
  bat.facing = endX < startX ? -1 : 1;
  bat.hitHunter = false;
}

/**
 * Столкновение летящей мыши с головой стоящего охотника.
 * Присед — можно увернуться (хитбокс головы ниже траектории).
 */
function batHitsHunterHead(batX, batY) {
  if (dead || isCrouching() || isPlacingDynamite()) return false;

  const hunterX = getHunterWorldX();
  const chinY = getStandingChinY();
  // Зона головы: от макушки до чуть ниже подбородка
  const headTop = chinY - HUNTER_DRAW_H * 0.18;
  const headBottom = chinY + 18;
  const headHalfW = HUNTER_HALF_W * 1.05;
  const batR = BAT_FLY_SIZE * 0.35;

  const nearestX = Math.max(hunterX - headHalfW, Math.min(batX, hunterX + headHalfW));
  const nearestY = Math.max(headTop, Math.min(batY, headBottom));
  const dx = batX - nearestX;
  const dy = batY - nearestY;
  return dx * dx + dy * dy <= batR * batR;
}

/** Начинает медленное перетаскивание охотника мышью назад. */
function startBatDrag(bat) {
  bat.state = "dragging";
  bat.hitHunter = true;
  batDrag = {
    bat,
    remainingPx: BAT_KNOCKBACK_M * PX_PER_METER,
  };
  placeAction = null;
}

/**
 * Плавно тащит охотника назад, пока не исчерпан remainingPx.
 * Мышь держится у подбородка на экране.
 */
function updateBatDrag(dt) {
  if (!batDrag) return;

  const step = Math.min(batDrag.remainingPx, BAT_DRAG_SPEED * dt);
  bgOffset = Math.max(0, bgOffset - step);
  batDrag.remainingPx -= step;

  // Мышь «цепляется» перед лицом охотника, пока тащит
  const bat = batDrag.bat;
  bat.dragWorldX = getHunterWorldX() + HUNTER_HALF_W * 0.55;
  bat.dragY = getStandingChinY();

  if (batDrag.remainingPx <= 0 || bgOffset <= 0) {
    bat.state = "gone";
    batDrag = null;
  }
}

/** Идёт ли сейчас перетаскивание мышью. */
function isBatDragging() {
  return batDrag !== null;
}

/**
 * Обновляет мышей: агрессия → срыв; полёт; удар → медленное перетаскивание назад.
 */
function updateBats(dt) {
  ensureBatsAhead();

  // Сначала доигрываем перетаскивание
  if (isBatDragging()) {
    updateBatDrag(dt);
    return;
  }

  const hunterX = getHunterWorldX();
  const aggroPx = BAT_AGGRO_M * PX_PER_METER;

  for (const bat of bats) {
    if (bat.state === "hanging") {
      const dist = Math.abs(bat.worldX - hunterX);
      if (dist < aggroPx) {
        startBatDive(bat);
      }
    } else if (bat.state === "flying") {
      bat.flyT += dt / BAT_FLY_DURATION;
      const p = batParabolaPoint(bat, Math.min(bat.flyT, 1));

      if (!bat.hitHunter && batHitsHunterHead(p.x, p.y)) {
        startBatDrag(bat);
        continue;
      }

      if (bat.flyT >= 1) {
        bat.state = "gone";
      }
    }
  }
}

/**
 * Рисует висящих и летящих мышей.
 */
function drawBats() {
  ensureBatsAhead();

  for (const bat of bats) {
    if (bat.state === "gone") continue;

    let screenX;
    let screenY;
    let img;
    let flip = 1;
    let size = BAT_SIZE;

    if (bat.state === "hanging") {
      img = assets.batHang;
      screenX = bat.worldX - bgOffset;
      screenY = BAT_CEILING_Y;
      // Мягкое пятно света за мышью — читается на тёмном потолке
      ctx.save();
      const glow = ctx.createRadialGradient(screenX, screenY + size * 0.45, 2, screenX, screenY + size * 0.45, size * 0.7);
      glow.addColorStop(0, "rgba(255, 220, 150, 0.35)");
      glow.addColorStop(0.55, "rgba(200, 160, 90, 0.12)");
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(screenX, screenY + size * 0.45, size * 0.55, size * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (bat.state === "dragging") {
      img = assets.batFly;
      size = BAT_FLY_SIZE;
      screenX = (bat.dragWorldX ?? getHunterWorldX()) - bgOffset;
      screenY = bat.dragY ?? getStandingChinY();
      flip = -1;
    } else {
      img = assets.batFly;
      size = BAT_FLY_SIZE;
      const p = batParabolaPoint(bat, Math.min(bat.flyT, 1));
      screenX = p.x - bgOffset;
      screenY = p.y;
      flip = bat.facing;
    }

    if (!img.naturalWidth) continue;
    if (screenX < -size || screenX > WIDTH + size) continue;

    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const scale = size / Math.max(nw, nh);
    const drawW = nw * scale;
    const drawH = nh * scale;

    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.scale(flip, 1);
    // Висящая: цепляется сверху; в полёте — центр спрайта на траектории
    if (bat.state === "hanging") {
      ctx.drawImage(img, -drawW / 2, 0, drawW, drawH);
    } else {
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    }
    ctx.restore();
  }
}

/**
 * Расстояние в пикселях от точки (динамита) до плиты стены [worldX, worldX + толщина].
 * 0 — заряд лежит «в» проекции стены.
 */
function distanceToWallPx(worldX, wall) {
  const left = wall.worldX;
  const right = wall.worldX + WALL_THICKNESS;
  if (worldX < left) return left - worldX;
  if (worldX > right) return worldX - right;
  return 0;
}

/**
 * После взрыва: если динамит ближе WALL_BLAST_RADIUS_M к стене —
 * помечаем стену destroyed (больше не рисуется и не блокирует путь).
 */
function destroyWallsNearBlast(blastWorldX) {
  const radiusPx = WALL_BLAST_RADIUS_M * PX_PER_METER;
  for (const wall of walls) {
    if (wall.destroyed) continue;
    if (distanceToWallPx(blastWorldX, wall) < radiusPx) {
      wall.destroyed = true;
    }
  }
}

/**
 * Максимально допустимый bgOffset, при котором передняя кромка
 * охотника ещё не врезается в ближайшую ЦЕЛУЮ стену впереди.
 *
 * Формула остановки:
 *   экранная X стены = wallX - bgOffset
 *   упор, когда стена дошла до (HUNTER_SCREEN_X + HUNTER_HALF_W)
 *   => bgOffset_max = wallX - hunterFront
 */
function getMaxOffset() {
  ensureWallsAhead();
  const hunterFront = HUNTER_SCREEN_X + HUNTER_HALF_W;
  let maxOffset = Infinity;

  for (const wall of walls) {
    if (wall.destroyed) continue;
    const stopAt = wall.worldX - hunterFront;
    // Берём первую стену, до которой ещё можно дойти (или в которую уже упёрлись)
    if (stopAt >= bgOffset - 1) {
      maxOffset = Math.min(maxOffset, stopAt);
      break;
    }
  }

  return maxOffset;
}

/**
 * World-X ближайшей целой стены впереди (для HUD «стена через N m»).
 * null — если впереди нет целых стен.
 */
function getNextWall() {
  const hunterFront = HUNTER_SCREEN_X + HUNTER_HALF_W;
  for (const wall of walls) {
    if (wall.destroyed) continue;
    if (wall.worldX - hunterFront >= bgOffset - 1) return wall.worldX;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Ввод с клавиатуры
// ---------------------------------------------------------------------------

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  // Не даём стрелкам/Esc/E прокручивать страницу и менять фокус
  if (["arrowleft", "arrowright", "a", "d", "s", "escape", "e"].includes(key)) {
    event.preventDefault();
  }
  if (key === "escape") {
    paused = !paused;
    return;
  }
  // E — начать укладку динамита (игнорируем автоповтор удержания клавиши)
  if (key === "e" && !event.repeat) {
    tryStartPlaceDynamite();
    return;
  }
  keys.add(key);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

/**
 * Переводит координаты клика по отображаемому canvas
 * во внутренние координаты игры (1280×720).
 */
function canvasToGameCoords(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * WIDTH,
    y: ((clientY - rect.top) / rect.height) * HEIGHT,
  };
}

/** Полный сброс партии — снова с начала коридора. */
function restartGame() {
  bgOffset = 0;
  facing = 1;
  walkPhase = 0;
  paused = false;
  blockedByWall = false;
  dead = false;
  placeAction = null;
  batDrag = null;
  pitFall = null;
  pitDeath = null;
  restartBtn = null;
  walls.length = 0;
  dynamites.length = 0;
  explosions.length = 0;
  bats.length = 0;
  spikePits.length = 0;
  keys.clear();
  ensureWallsAhead();
  ensureBatsAhead();
  ensureSpikePitsAhead();
}

canvas.addEventListener("click", (event) => {
  if (!dead || !restartBtn) return;
  const { x, y } = canvasToGameCoords(event.clientX, event.clientY);
  if (
    x >= restartBtn.x &&
    x <= restartBtn.x + restartBtn.w &&
    y >= restartBtn.y &&
    y <= restartBtn.y + restartBtn.h
  ) {
    restartGame();
  }
});

// Курсор-указатель над кнопкой перезапуска
canvas.addEventListener("mousemove", (event) => {
  if (!dead || !restartBtn) {
    canvas.style.cursor = "default";
    return;
  }
  const { x, y } = canvasToGameCoords(event.clientX, event.clientY);
  const over =
    x >= restartBtn.x &&
    x <= restartBtn.x + restartBtn.w &&
    y >= restartBtn.y &&
    y <= restartBtn.y + restartBtn.h;
  canvas.style.cursor = over ? "pointer" : "default";
});

/** Зажата ли клавиша движения влево (← или A). */
function isMovingLeft() {
  return keys.has("arrowleft") || keys.has("a");
}

/** Зажата ли клавиша движения вправо (→ или D). */
function isMovingRight() {
  return keys.has("arrowright") || keys.has("d");
}

/** Зажата ли S — присед. */
function isCrouching() {
  return keys.has("s");
}

/** Идёт ли сейчас анимация наклона / укладки. */
function isPlacingDynamite() {
  return placeAction !== null;
}

/**
 * Запускает анимацию «нагнуться и положить динамит»,
 * если персонаж не на паузе и уже не занят укладкой.
 */
function tryStartPlaceDynamite() {
  if (paused || dead || isPlacingDynamite() || isCrouching()) return;
  placeAction = { elapsed: 0 };
}

/** Мировая X-координата центра охотника (персонаж на экране не двигается). */
function getHunterWorldX() {
  return bgOffset + HUNTER_SCREEN_X;
}

/**
 * Кладёт заряд перед охотником в мировых координатах
 * (вызывается после возврата в обычную стойку).
 */
function placeDynamiteInWorld() {
  const worldX = bgOffset + HUNTER_SCREEN_X + facing * DYNAMITE_PLACE_OFFSET;
  dynamites.push({ worldX, age: 0, exploded: false });
}

/**
 * Если охотник ближе DEATH_BLAST_RADIUS_M от эпицентра — смерть.
 * Расстояние считается до ближайшей точки «тела» (центр ± HUNTER_HALF_W).
 */
function applyBlastDamageToHunter(blastWorldX) {
  const hunterX = getHunterWorldX();
  const distToCenter = Math.abs(blastWorldX - hunterX);
  const distPx = Math.max(0, distToCenter - HUNTER_HALF_W);
  if (distPx < DEATH_BLAST_RADIUS_M * PX_PER_METER) {
    dead = true;
    placeAction = null;
  }
}

// ---------------------------------------------------------------------------
// Отрисовка фона
// ---------------------------------------------------------------------------

/**
 * Рисует зацикленный фон коридора.
 *
 * Картинка масштабируется по высоте под HEIGHT, затем тайлится по X.
 * Смещение bgOffset сдвигает тайлы влево — создаётся ощущение ходьбы.
 *
 * Формула стартового x:
 *   -((bgOffset % drawW) + drawW) % drawW
 * гарантирует отрицательный или нулевой старт в диапазоне (-drawW, 0],
 * чтобы не было щели на стыке тайлов при любом bgOffset.
 */
function drawBackground() {
  const bg = assets.bg;
  const tileW = bg.naturalWidth || WIDTH;
  const tileH = bg.naturalHeight || HEIGHT;
  const scale = HEIGHT / tileH;
  const drawW = tileW * scale;
  const drawH = HEIGHT;

  let x = -((bgOffset % drawW) + drawW) % drawW;

  while (x < WIDTH) {
    ctx.drawImage(bg, x, 0, drawW, drawH);
    x += drawW;
  }
}

// ---------------------------------------------------------------------------
// Отрисовка перегородок из каменных блоков
// ---------------------------------------------------------------------------

/**
 * Детерминированный хэш двух чисел → беззнаковое 32-битное.
 * Нужен, чтобы у блоков «случайный», но стабильный вид
 * (один и тот же блок всегда выглядит одинаково).
 */
function hash2(a, b) {
  return ((a * 73856093) ^ (b * 19349663)) >>> 0;
}

/**
 * Рисует один каменный блок перегородки.
 *
 * @param {number} x      — левый верхний угол на экране
 * @param {number} y      — левый верхний угол на экране
 * @param {number} w      — ширина блока
 * @param {number} h      — высота блока
 * @param {number} seed   — зерно для выбора куска текстуры и деталей
 *
 * Текстура берётся куском из того же PNG, что и фон коридора,
 * чтобы перегородка визуально совпадала с пирамидой.
 */
function drawStoneBlock(x, y, w, h, seed) {
  const bg = assets.bg;
  const srcW = bg.naturalWidth || WIDTH;
  const srcH = bg.naturalHeight || HEIGHT;

  // Разные seed → разные участки исходной картинки
  const srcX = 80 + (seed % 9) * 70;
  const srcY = 40 + ((seed >> 4) % 6) * 80;
  const patchW = Math.min(160, srcW - srcX);
  const patchH = Math.min(140, srcH - srcY);

  if (patchW > 0 && patchH > 0) {
    // sx,sy,sw,sh → источник; dx,dy,dw,dh → куда на canvas
    ctx.drawImage(bg, srcX, srcY, patchW, patchH, x, y, w, h);
  } else {
    // Запасной вариант, если вырез вышел за границы изображения
    ctx.fillStyle = "#8a6d45";
    ctx.fillRect(x, y, w, h);
  }

  // Тёплый полупрозрачный слой — блоки выглядят плотнее, чем просто вырез фона
  const tone = 0.12 + (seed % 5) * 0.03;
  ctx.fillStyle = `rgba(120, 85, 45, ${tone})`;
  ctx.fillRect(x, y, w, h);

  // Тёмная обводка = «швы» раствора между камнями
  ctx.strokeStyle = "rgba(28, 18, 10, 0.75)";
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);

  // Лёгкий блик по левому/верхнему краю (объём)
  ctx.strokeStyle = "rgba(255, 220, 160, 0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 4, y + h - 4);
  ctx.lineTo(x + 4, y + 4);
  ctx.lineTo(x + w - 4, y + 4);
  ctx.stroke();

  // Мелкие «выбоины» / насечки на камне
  ctx.fillStyle = "rgba(25, 16, 8, 0.35)";
  const marks = 2 + (seed % 3);
  for (let i = 0; i < marks; i++) {
    const mx = x + 14 + ((seed + i * 17) % Math.max(8, w - 28));
    const my = y + 18 + ((seed + i * 29) % Math.max(8, h - 36));
    ctx.fillRect(mx, my, 3, 10);
    ctx.fillRect(mx - 3, my + 3, 9, 2);
  }
}

/**
 * Рисует одну перегородку на экране.
 *
 * @param {number} screenX — экранная X левой грани стены (worldX - bgOffset)
 *
 * Порядок слоёв:
 *  1) затемнение фона СЗАДИ стены (правее неё);
 *  2) кладка из блоков на всю высоту экрана;
 *  3) градиент объёма и контур.
 */
function drawStoneWall(screenX) {
  // За пределами экрана (с запасом) не рисуем — экономия
  if (screenX > WIDTH + 40 || screenX + WALL_THICKNESS < -40) return;

  // --- Затемнённый фон за перегородкой ---
  // Фон уже нарисован целиком; здесь только затемняем область правее стены,
  // чтобы коридор «за тупиком» выглядел глуше, но не был чёрной пустотой.
  const behindX = Math.max(0, screenX + WALL_THICKNESS - 2);
  if (behindX < WIDTH) {
    const w = WIDTH - behindX;
    ctx.fillStyle = "rgba(0, 0, 0, 0.82)";
    ctx.fillRect(behindX, 0, w, HEIGHT);

    // Доп. тень у самой грани стены (чуть сильнее затемнение у камня)
    const shade = ctx.createLinearGradient(behindX, 0, Math.min(WIDTH, behindX + 70), 0);
    shade.addColorStop(0, "rgba(0, 0, 0, 0.25)");
    shade.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = shade;
    ctx.fillRect(behindX, 0, Math.min(70, w), HEIGHT);
  }

  // --- Кладка блоков на всю высоту (0 … HEIGHT) ---
  for (let row = 0; row < WALL_ROWS; row++) {
    const y = row * BLOCK_H;
    // Последний ряд растягиваем, чтобы не было щели у низа экрана
    const h = row === WALL_ROWS - 1 ? HEIGHT - y : BLOCK_H;
    // Чередование рядов со сдвигом — как настоящая каменная кладка
    const offset = row % 2 === 0 ? 0 : -Math.floor(BLOCK_W * 0.35);

    for (let col = -1; col <= WALL_COLS; col++) {
      const x = screenX + col * BLOCK_W + offset;
      // Блоки, полностью вне плиты стены, пропускаем
      if (x + BLOCK_W < screenX - 4 || x > screenX + WALL_THICKNESS + 4) continue;

      // Обрезаем вылезающие края блоков строго по прямоугольнику стены
      ctx.save();
      ctx.beginPath();
      ctx.rect(screenX, 0, WALL_THICKNESS, HEIGHT);
      ctx.clip();
      drawStoneBlock(x, y, BLOCK_W + 1, h + 1, hash2(row + 11, col + 23));
      ctx.restore();
    }
  }

  // --- Объёмный градиент: свет слева (от коридора), тень справа (к затемнению) ---
  const edge = ctx.createLinearGradient(screenX, 0, screenX + WALL_THICKNESS, 0);
  edge.addColorStop(0, "rgba(255, 210, 140, 0.18)");
  edge.addColorStop(0.15, "rgba(0, 0, 0, 0)");
  edge.addColorStop(0.75, "rgba(0, 0, 0, 0.25)");
  edge.addColorStop(1, "rgba(0, 0, 0, 0.7)");
  ctx.fillStyle = edge;
  ctx.fillRect(screenX, 0, WALL_THICKNESS, HEIGHT);

  // Внешний контур перегородки
  ctx.strokeStyle = "rgba(10, 6, 2, 0.9)";
  ctx.lineWidth = 3;
  ctx.strokeRect(screenX + 1.5, 1.5, WALL_THICKNESS - 3, HEIGHT - 3);
}

/**
 * Проходит по всем сгенерированным стенам и рисует те,
 * что попадают в видимую область (проверка внутри drawStoneWall).
 */
function drawWalls() {
  ensureWallsAhead();
  for (const wall of walls) {
    if (wall.destroyed) continue; // разрушенная перегородка не рисуется
    const screenX = wall.worldX - bgOffset;
    drawStoneWall(screenX);
  }
}

/**
 * Рисует все ещё не взорвавшиеся заряды динамита на земле.
 * Тот же спрайт и размер, что и в руках при укладке.
 */
function drawDynamites() {
  for (const stick of dynamites) {
    if (stick.exploded) continue;
    const screenX = stick.worldX - bgOffset;
    const { drawW } = getDynamiteDrawSize();
    if (screenX < -drawW || screenX > WIDTH + drawW) continue;

    // Мигание в последнюю секунду фитиля
    // Тот же уровень пола, что и у тени/рук — иначе заряд «подскакивает» вверх
    const fuseLeft = DYNAMITE_FUSE_TIME - stick.age;
    if (fuseLeft < 1 && Math.floor(stick.age * 8) % 2 === 0) {
      ctx.save();
      ctx.globalAlpha = 0.75;
      drawDynamiteSprite(screenX, SHADOW_CENTER_Y);
      ctx.restore();
    } else {
      drawDynamiteSprite(screenX, SHADOW_CENTER_Y);
    }
  }
}

/**
 * Рисует вспышки взрывов (спрайт увеличивается и гаснет).
 */
function drawExplosions() {
  const img = assets.explosion;
  if (!img.naturalWidth) return;

  for (const boom of explosions) {
    const t = boom.elapsed / EXPLOSION_DURATION;
    if (t >= 1) continue;

    const screenX = boom.worldX - bgOffset;
    // Рост + лёгкое затухание к концу
    const grow = 0.55 + t * 0.9;
    const alpha = 1 - t * t;
    const size = EXPLOSION_SIZE * grow;
    const x = screenX - size / 2;
    const y = SHADOW_CENTER_Y - size * 0.72;

    if (x > WIDTH || x + size < 0) continue;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Персонаж
// ---------------------------------------------------------------------------

/**
 * Выбирает спрайт охотника по состоянию:
 * смерть → dead; укладка → place; ходьба → чередование left/right; иначе idle.
 */
function getHunterSprite(moving) {
  if (dead && pitDeath) return assets.hunter;
  if (dead) return assets.hunterDead;
  if (pitFall) return assets.hunter;
  if (isBatDragging()) return assets.hunterFly;
  if (isPlacingDynamite()) return assets.hunterPlace;
  if (isCrouching()) return assets.hunterCrouch;
  if (moving) {
    // Чередуем кадры ходьбы: idle и шаг правой ногой
    const step = Math.floor(walkPhase) % 2;
    return step === 0 ? assets.hunterWalkRight : assets.hunter;
  }
  return assets.hunter;
}

/**
 * Пустые пиксели под ступнями в исходном PNG (холст больше, чем тело).
 * Без этого низ canvas ≠ пол, и охотник «висит» над тенью.
 */
function getSpriteFeetPadPx(hunter) {
  if (hunter === assets.hunterDead) return 5;
  if (hunter === assets.hunterFly) return 20;
  if (hunter === assets.hunterPlace) return 19;
  if (hunter === assets.hunterCrouch) return 16;
  if (hunter === assets.hunterWalkRight) return 21;
  if (hunter === assets.hunterWalkLeft) return 15;
  return 16; // idle
}

/**
 * Рисует охотника в фиксированной экранной позиции.
 *
 * Ступни (низ непрозрачного контента) совпадают с центром овала тени.
 * Масштаб: высота холста спрайта → HUNTER_DRAW_H.
 */
function drawHunter(dt, moving) {
  if (pitDeath) return;

  if (moving) {
    walkPhase += dt * WALK_FPS;
  } else {
    // Сбрасываем на начало цикла, чтобы снова стартовать с левой ноги
    walkPhase = 0;
  }

  const placing = isPlacingDynamite();
  const dragging = isBatDragging();
  const sinking = getPitSinkProgress() > 0;
  const hunter = getHunterSprite(moving);

  // Лёгкое покачивание корпуса в такт шагу
  const bob =
    moving && !placing && !dead && !isCrouching() && !dragging && !sinking
      ? Math.sin(walkPhase * Math.PI) * 3
      : 0;

  const imgW = hunter.naturalWidth || 1;
  const imgH = hunter.naturalHeight || 1;
  const scale = HUNTER_DRAW_H / imgH;
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const x = HUNTER_SCREEN_X;

  // Низ картинки ниже ступней на feetPad — компенсируем; +12 — доп. сдвиг только спрайта
  const feetPad = getSpriteFeetPadPx(hunter) * scale;
  const flyLift = dragging ? 48 : 0;
  const pitSink = getPitSinkPx(hunter);
  const y = SHADOW_CENTER_Y - drawH + feetPad + bob + 12 - flyLift + pitSink;

  // Тень: овал на полу, центр = точка опоры
  if (!sinking && !pitDeath) {
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.beginPath();
    const shadowW = dead ? drawW * 0.42 : dragging ? drawW * 0.18 : drawW * 0.28;
    ctx.ellipse(x, SHADOW_CENTER_Y, shadowW, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(x, y + drawH / 2);
  // Мёртвый спрайт не зеркалим: шляпа должна оставаться слева от тела
  if (!dead) {
    ctx.scale(facing, 1);
  }
  ctx.drawImage(hunter, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();

  // Пока персонаж наклонился — динамит «в руках» у земли (тот же спрайт/размер)
  if (placing && !dead) {
    const handX = HUNTER_SCREEN_X + facing * DYNAMITE_PLACE_OFFSET;
    drawDynamiteSprite(handX, SHADOW_CENTER_Y);
  }
}

// ---------------------------------------------------------------------------
// HUD (интерфейс поверх игры)
// ---------------------------------------------------------------------------

/**
 * Верхняя панель: название, пройденные метры, расстояние до стены,
 * сообщение об упоре; при паузе — затемнение и надпись «ПАУЗА».
 */
function drawHud() {
  const pathM = Math.floor(bgOffset / PX_PER_METER);
  const nextWall = getNextWall();
  // Сколько метров осталось до касания ближайшей стены (не меньше 0)
  const nextWallM =
    nextWall == null
      ? "—"
      : Math.max(
          0,
          Math.ceil((nextWall - bgOffset - (HUNTER_SCREEN_X + HUNTER_HALF_W)) / PX_PER_METER)
        );

  // Полупрозрачная плашка; выше, если нужно место под текст об упоре
  ctx.fillStyle = "rgba(10, 7, 4, 0.45)";
  ctx.fillRect(16, 16, 300, blockedByWall ? 74 : 54);
  ctx.strokeStyle = "rgba(232, 213, 176, 0.35)";
  ctx.strokeRect(16.5, 16.5, 299, blockedByWall ? 73 : 53);

  ctx.fillStyle = "#e8d5b0";
  ctx.font = "600 18px Segoe UI, sans-serif";
  ctx.fillText("Treasure Hunter", 28, 40);
  ctx.font = "14px Segoe UI, sans-serif";
  ctx.fillStyle = "rgba(232, 213, 176, 0.8)";
  ctx.fillText(`Путь: ${pathM} m · стена через: ${nextWallM} m`, 28, 58);

  if (blockedByWall && !dead) {
    ctx.fillStyle = "#d4a06a";
    ctx.fillText("Упёрся в стену — дальше нельзя", 28, 76);
  }

  if (dead) {
    // Лёгкое затемнение — мёртвый спрайт под надписью остаётся виден
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = "#e8b0a0";
    ctx.font = "700 56px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ты умер", WIDTH / 2, HEIGHT * 0.38);

    // Кнопка «Начать заново» под надписью
    const btnW = 280;
    const btnH = 56;
    const btnX = WIDTH / 2 - btnW / 2;
    const btnY = HEIGHT * 0.38 + 36;
    restartBtn = { x: btnX, y: btnY, w: btnW, h: btnH };

    ctx.fillStyle = "rgba(90, 55, 28, 0.92)";
    ctx.fillRect(btnX, btnY, btnW, btnH);
    ctx.strokeStyle = "rgba(232, 213, 176, 0.85)";
    ctx.lineWidth = 2;
    ctx.strokeRect(btnX + 0.5, btnY + 0.5, btnW - 1, btnH - 1);

    ctx.fillStyle = "#e8d5b0";
    ctx.font = "600 22px Segoe UI, sans-serif";
    ctx.fillText("Начать заново", WIDTH / 2, btnY + 36);
    ctx.textAlign = "left";
    return;
  }

  restartBtn = null;
  canvas.style.cursor = "default";

  if (paused) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#e8d5b0";
    ctx.font = "700 42px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ПАУЗА", WIDTH / 2, HEIGHT / 2);
    ctx.font = "18px Segoe UI, sans-serif";
    ctx.fillText("Esc — продолжить", WIDTH / 2, HEIGHT / 2 + 36);
    ctx.textAlign = "left";
  }
}

// ---------------------------------------------------------------------------
// Логика кадра (обновление → отрисовка)
// ---------------------------------------------------------------------------

/**
 * Обновляет состояние мира за dt секунд:
 * направление, bgOffset, флаг упора в стену.
 *
 * Важно: персонаж на экране не двигается — меняется только bgOffset.
 * Движение вправо ограничено getMaxOffset(); назад — нулём (старт уровня).
 */
/**
 * Обновляет анимацию укладки.
 * Динамит на земле появляется только когда охотник снова выпрямился.
 */
function updatePlaceAction(dt) {
  if (!placeAction || dead) return;

  placeAction.elapsed += dt;

  if (placeAction.elapsed >= PLACE_DYNAMITE_DURATION) {
    placeAction = null;
    // Персонаж снова в обычной стойке — теперь кладём заряд на землю
    placeDynamiteInWorld();
  }
}

/**
 * Тикает фитиль у зарядов и запускает взрывы через DYNAMITE_FUSE_TIME.
 * Также обновляет и чистит вспышки explosions.
 */
function updateDynamitesAndExplosions(dt) {
  for (const stick of dynamites) {
    if (stick.exploded) continue;
    stick.age += dt;
    if (stick.age >= DYNAMITE_FUSE_TIME) {
      stick.exploded = true;
      explosions.push({ worldX: stick.worldX, elapsed: 0 });
      // Стены ближе 1 м от эпицентра разрушаются и перестают блокировать путь
      destroyWallsNearBlast(stick.worldX);
      // Охотник ближе 5 м — смерть
      applyBlastDamageToHunter(stick.worldX);
    }
  }

  // Удаляем уже взорвавшиеся заряды (спрайт больше не нужен)
  for (let i = dynamites.length - 1; i >= 0; i--) {
    if (dynamites[i].exploded) dynamites.splice(i, 1);
  }

  for (const boom of explosions) {
    boom.elapsed += dt;
  }
  for (let i = explosions.length - 1; i >= 0; i--) {
    if (explosions[i].elapsed >= EXPLOSION_DURATION) explosions.splice(i, 1);
  }
}

function update(dt) {
  if (paused) return;

  ensureWallsAhead();
  ensureBatsAhead();
  ensureSpikePitsAhead();
  // Фитиль, взрывы и полёт мышей — даже после смерти (доиграть анимации)
  updateDynamitesAndExplosions(dt);
  updateBats(dt);

  if (pitFall) {
    updatePitFall(dt);
    return;
  }

  if (dead) return;

  updatePlaceAction(dt);

  // Во время укладки, приседа или перетаскивания мышью — управления нет
  if (isPlacingDynamite() || isCrouching() || isBatDragging()) {
    const maxOffset = getMaxOffset();
    blockedByWall = bgOffset >= maxOffset - 0.5;
  } else {
    // dir: -1 влево, +1 вправо, 0 — стоим (или зажаты обе стороны)
    let dir = 0;
    if (isMovingLeft()) dir -= 1;
    if (isMovingRight()) dir += 1;

    blockedByWall = false;

    if (dir !== 0) {
      facing = dir;
      const next = bgOffset + dir * SCROLL_SPEED * dt;
      const maxOffset = getMaxOffset();

      if (dir > 0 && next >= maxOffset) {
        bgOffset = Math.max(0, maxOffset);
        blockedByWall = true;
      } else {
        bgOffset = Math.max(0, next);
      }
    } else {
      const maxOffset = getMaxOffset();
      blockedByWall = bgOffset >= maxOffset - 0.5;
    }
  }

  checkPitFall();
}

/**
 * Реально ли персонаж «шагает» в этом кадре.
 */
function isActuallyMoving() {
  if (paused || dead || pitFall || isPlacingDynamite() || isCrouching() || isBatDragging()) return false;
  if (isMovingLeft() && bgOffset > 0) return true;
  if (isMovingRight() && !blockedByWall) return true;
  return false;
}

/**
 * Полная отрисовка кадра:
 * фон → стены → динамит → мыши → охотник → взрывы → HUD.
 */
function render(dt) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  if (!assetsReady()) {
    ctx.fillStyle = "#1a120c";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#e8d5b0";
    ctx.font = "20px Segoe UI, sans-serif";
    ctx.fillText("Загрузка…", 40, 60);
    return;
  }

  drawBackground();
  drawWalls();
  drawSpikePits();
  drawDynamites();
  drawHunter(dt, isActuallyMoving());
  drawBats(); // мышь поверх охотника
  drawExplosions();
  drawHud();
}

/**
 * Один кадр requestAnimationFrame.
 * dt ограничен сверху (0.05 с), чтобы при лагах персонаж
 * не «телепортировался» сквозь стену за один кадр.
 */
function frame(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;
  update(dt);
  render(dt);
  requestAnimationFrame(frame);
}

// Предварительно создаём первые стены и мышей ещё до первого кадра
ensureWallsAhead();
ensureBatsAhead();
ensureSpikePitsAhead();

// Двойной rAF: на первом тике только запоминаем время,
// со второго начинаем нормальный цикл с корректным dt
requestAnimationFrame((timestamp) => {
  lastTime = timestamp;
  requestAnimationFrame(frame);
});
