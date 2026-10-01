import { UNIT_TYPES } from "../shared/data.mjs";
import { MAPS, getMap } from "../shared/maps.mjs";
import {
  DEFAULT_CONFIG,
  normalizeConfig,
  validateConfig,
} from "../shared/config.mjs";
import { Battlefield } from "./renderer.mjs";
import { bindControls } from "./controls.mjs";
import { Connection } from "./network.mjs";

const $ = (id) => document.getElementById(id);
const storage = {
  get(k, f) {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? f;
    } catch {
      return f;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};
const decks = {
  combined: Object.keys(UNIT_TYPES),
  armored: [
    "infantry",
    "tank",
    "transport",
    "recon",
    "supply",
    "artillery",
    "aa",
  ],
  airmobile: [
    "infantry",
    "transport",
    "recon",
    "supply",
    "aa",
    "helicopter",
    "jet",
  ],
};
const icons = {
  infantry: "♟",
  tank: "▰",
  transport: "▱",
  recon: "⌖",
  supply: "✚",
  artillery: "↗",
  aa: "⌁",
  helicopter: "✣",
  jet: "✈",
};
const prefs = storage.get("fb-settings", {});
$("playerName").value = prefs.name || "Comandante";
$("qualitySelect").value = prefs.quality || "medium";
$("deckSelect").value = prefs.deck || "combined";
$("serverUrl").value =
  prefs.server ||
  (["localhost", "127.0.0.1"].includes(location.hostname)
    ? location.origin
    : "");
let view,
  worker = null,
  connection = null,
  state = null,
  playerId = "local",
  playing = false,
  mode = "solo",
  room = null,
  order = null,
  deployType = null,
  multi = false,
  selected = [],
  groups = {},
  savingGroup = false,
  toastTimeout,
  pause = false,
  gameEnded = false,
  networkStatus = "",
  configIntent = "solo";
let matchConfig = normalizeConfig(
  storage.get("fb-match-config", DEFAULT_CONFIG),
);
let activeBuildingId = null;
const map = () =>
  getMap(state?.config?.mapId ?? state?.mapId ?? matchConfig.mapId);
const panelButtons = {
  deployPanel: "deployToggle",
  mapPanel: "mapToggle",
  groupPanel: "groupToggle",
  unitPanel: "unitToggle",
  buildingPanel: null,
};
function closePanels() {
  for (const [id, button] of Object.entries(panelButtons)) {
    $(id).hidden = true;
    if (button) $(button).setAttribute("aria-expanded", "false");
  }
  activeBuildingId = null;
  view?.setBuildingContext(null, false);
  updateTimeControls();
}
function togglePanel(id) {
  const open = $(id).hidden;
  closePanels();
  if (open) {
    $(id).hidden = false;
    if (panelButtons[id])
      $(panelButtons[id]).setAttribute("aria-expanded", "true");
  }
  updateTimeControls();
}
function updateTimeControls() {
  const clock = state?.timeControl;
  $("timeControls").hidden =
    !playing || gameEnded || !clock || mode === "versus" || mode === "pvp";
  document.querySelectorAll("[data-speed]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(
        Number(button.dataset.speed) === (clock?.paused ? 0 : clock?.speed),
      ),
    );
    button.disabled = !!me()?.surrendered || !!state?.paused;
  });
  if (!clock) return;
  const rate = clock.paused
    ? "En pausa"
    : String(clock.speed).replace(".", ",") + "×";
  $("timeStatus").textContent =
    rate +
    (clock.changedByName ? " · " + clock.changedByName : "") +
    (state.pendingOrders ? " · " + state.pendingOrders + " órdenes" : "");
  $("timeStatus").title = $("timeStatus").textContent;
}
function updateRevealControl() {
  const allowed =
    playing && !gameEnded && state?.config?.allowEnemyReveal === true;
  const button = $("revealEnemies");
  button.hidden = !allowed;
  button.disabled = !!state?.paused;
  button.setAttribute("aria-pressed", String(state?.revealEnemies === true));
  button.textContent = state?.revealEnemies
    ? "Ocultar enemigos"
    : "Mostrar enemigos";
  $("app").classList.toggle("reveal-allowed", allowed);
}
function commandFeedback(data) {
  if (
    data.type === "error" ||
    (["ack", "commandResult"].includes(data.type) && !data.ok)
  )
    toast(data.message || data.error);
  else if (data.type === "ack" && data.queued)
    toast("Orden preparada. Se ejecutará al continuar.");
}
function openBuilding(building) {
  closePanels();
  activeBuildingId = building.id;
  $("buildingPanel").hidden = false;
  view?.setBuildingContext(building.id, true);
  updateBuilding();
}
function updateBuilding() {
  if (!activeBuildingId) return;
  const building = (map().buildings ?? []).find(
    (b) => b.id === activeBuildingId,
  );
  if (!building) {
    closePanels();
    return;
  }
  const status = state?.buildings?.find((b) => b.id === building.id);
  const occupants =
    state?.units.filter((u) => u.garrisonedIn === building.id) ?? [];
  const ownOccupants = occupants.filter((u) => u.ownerId === playerId);
  const infantry =
    state?.units.filter(
      (u) =>
        selected.includes(u.id) &&
        u.type === "infantry" &&
        !u.loadedIn &&
        !u.garrisonedIn,
    ) ?? [];
  $("buildingTitle").textContent = building.name;
  $("buildingStatus").textContent = building.occupiable
    ? building.capacity +
      " plazas · " +
      (status?.team === me()?.team
        ? occupants.length +
          " ocupadas" +
          (status.reserved ? " · " + status.reserved + " reservadas" : "")
        : status?.occupied > 0
          ? status.occupied +
            (status.displayOnly
              ? " enemigas · solo mostradas"
              : " enemigas detectadas")
          : "Ocupación no confirmada")
    : "Edificio sólido · no admite ocupación";
  $("buildingHelp").textContent = status?.displayOnly
    ? "Ocupación mostrada por la ayuda visual. No implica detección ni permite disparar a través de las paredes."
    : building.occupiable
      ? "La infantería llega al acceso antes de entrar. Recibe protección dentro; Mover ordena salir y continuar."
      : "Bloquea el paso terrestre, la visión y el fuego directo a través de sus paredes.";
  $("buildingOccupants").replaceChildren();
  for (const unit of occupants) {
    const button = document.createElement("button");
    button.textContent =
      unit.team !== me()?.team
        ? UNIT_TYPES[unit.type].short +
          (unit.displayOnly
            ? " · enemiga solo mostrada"
            : " · enemiga detectada")
        : UNIT_TYPES[unit.type].short +
          " · " +
          Math.ceil(unit.hp) +
          " PV · " +
          Math.floor(unit.ammo) +
          " munición" +
          (unit.ownerId === playerId ? "" : " · aliado");
    button.disabled = unit.ownerId !== playerId;
    button.onclick = () => {
      select([unit.id]);
      openBuilding(building);
    };
    $("buildingOccupants").append(button);
  }
  $("enterBuilding").hidden = !building.occupiable;
  $("enterBuilding").disabled =
    !infantry.length ||
    !!me()?.surrendered ||
    (status?.occupied > 0 && status.team !== me()?.team);
  $("exitBuilding").hidden = !ownOccupants.length;
  $("exitBuilding").disabled = !!me()?.surrendered;
}

function toast(text) {
  $("toast").textContent = text;
  $("toast").classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => $("toast").classList.remove("show"), 3200);
}
function savePrefs() {
  storage.set("fb-settings", {
    name: $("playerName").value.trim() || "Comandante",
    quality: $("qualitySelect").value,
    deck: $("deckSelect").value,
    server: $("serverUrl").value.trim(),
  });
}
function me() {
  return state?.players.find((p) => p.id === playerId);
}
function send(command) {
  if (!playing || gameEnded || me()?.surrendered) return;
  if (state?.paused) {
    toast("La partida está pausada por una desconexión.");
    return;
  }
  if (mode === "solo") worker?.postMessage({ type: "command", command });
  else connection?.command(command);
}
function select(ids) {
  selected = ids;
  closePanels();
  view?.setSelected(ids);
  updateSelection();
}
function updateSelection() {
  const units = state?.units.filter((u) => selected.includes(u.id)) ?? [];
  view?.setBuildingContext(
    activeBuildingId,
    order === "garrison" ||
      units.some((u) => u.type === "infantry" && !u.garrisonedIn),
  );
  $("selectionPanel").hidden =
    !playing || !units.length || !!order || !!deployType || !!me()?.surrendered;
  if (!units.length) {
    $("unitPanel").hidden = true;
    $("unitToggle").setAttribute("aria-expanded", "false");
    return;
  }
  const u = units[0];
  $("selectionText").textContent =
    units.length === 1
      ? UNIT_TYPES[u.type].short +
        " · " +
        Math.ceil((u.hp / u.maxHp) * 100) +
        "%" +
        (u.garrisonedIn
          ? " · dentro"
          : u.pendingBuildingId
            ? " · entrando"
            : "")
      : units.length + " unidades";
  $("unitSummary").textContent =
    units.length === 1
      ? UNIT_TYPES[u.type].name
      : units.length + " unidades seleccionadas";
  $("unitDetails").textContent = units
    .map((u) => {
      const d = UNIT_TYPES[u.type];
      return (
        d.name +
        ": " +
        Math.ceil(u.hp) +
        "/" +
        u.maxHp +
        " integridad · " +
        u.ammo +
        " munición · " +
        Math.round(u.suppression * 100) +
        "% supresión · alcance " +
        d.range +
        " · visión " +
        d.vision +
        (u.type === "supply" ? " · reservas " + Math.round(u.stock) : "") +
        (u.cargo?.length ? " · " + u.cargo.length + " a bordo" : "") +
        ". " +
        d.description
      );
    })
    .join("\n\n");
  document.querySelectorAll("[data-order]").forEach((b) => {
    const o = b.dataset.order;
    const allowed = !(
      (o === "fire" && !units.some((u) => u.type === "artillery")) ||
      (o === "load" && !units.some((u) => u.type === "infantry")) ||
      (o === "unload" && !units.some((u) => u.cargo?.length)) ||
      (o === "smoke" && !units.some((u) => u.smoke > 0)) ||
      (o === "garrison" &&
        !units.some(
          (u) => u.type === "infantry" && !u.garrisonedIn && !u.loadedIn,
        )) ||
      (o === "exit" && !units.some((u) => u.garrisonedIn))
    );
    b.hidden = !allowed;
    b.disabled = !!me()?.surrendered;
    b.classList.toggle("active", o === order);
  });
}
function updateOrderHint() {
  const hints = {
    move: "Toca el destino · combate automático en ruta",
    attackMove: "Toca el destino del avance · las tropas atacarán en ruta",
    fire: "Toca la zona de fuego para la artillería",
    smoke: "Toca dónde desplegar humo",
    load: "Toca un transporte propio cercano",
    garrison: "Toca un edificio señalado para entrar",
  };
  const pending = !!order || !!deployType;
  const message = state?.paused
    ? `${state.pauseReason || "Esperando reconexión"}${state.reconnectDeadline ? " · " + Math.max(0, Math.ceil((state.reconnectDeadline - Date.now()) / 1000)) + " s" : ""}`
    : deployType
      ? `${UNIT_TYPES[deployType].name}: toca tu base`
      : (hints[order] ?? "");
  $("orderHint").textContent = message + (pending ? " · Cancelar ×" : "");
  $("orderHint").hidden = !playing || (!pending && !state?.paused);
  $("orderHint").disabled = !pending;
}
function setOrder(value) {
  order = value;
  if (value) closePanels();
  deployType = null;
  updateOrderHint();
  updateSelection();
  document
    .querySelectorAll(".unit-card")
    .forEach((b) => b.classList.remove("active"));
}
function setupCards() {
  const deck = me()?.deck ?? decks[$("deckSelect").value];
  $("unitCards").replaceChildren();
  for (const type of deck) {
    const u = UNIT_TYPES[type];
    if (!u) continue;
    const b = document.createElement("button");
    b.className = "unit-card";
    b.dataset.unit = type;
    b.title = u.description;
    b.innerHTML = `<span class="unit-icon" aria-hidden="true">${icons[type]}</span><span class="unit-info">${u.name}<small>VIS ${u.vision} · ALC ${u.range}</small></span><strong>${u.cost}</strong>`;
    b.onclick = () => {
      setOrder(null);
      deployType = type;
      b.classList.add("active");
      updateOrderHint();
      const base = map().spawns[me()?.team ?? 0];
      view.focus(base.x, base.y);
      closePanels();
      updateSelection();
    };
    $("unitCards").append(b);
  }
}
function tap(x, y, shift) {
  if (!playing || pause || gameEnded || !$("helpScreen").hidden) return;
  const p = view.worldAt(x, y);
  if (!p) return;
  if (deployType) {
    send({ type: "deploy", unitType: deployType, x: p.x, y: p.y });
    deployType = null;
    setOrder(null);
    return;
  }
  if (order) {
    if (order === "garrison") {
      const building = view.pickBuilding(x, y);
      if (!building?.occupiable) {
        toast("Toca un edificio ocupable señalado.");
        return;
      }
      const infantry = state.units
        .filter(
          (u) =>
            selected.includes(u.id) &&
            u.type === "infantry" &&
            !u.garrisonedIn &&
            !u.loadedIn,
        )
        .map((u) => u.id);
      send({ type: "garrison", unitIds: infantry, buildingId: building.id });
    } else if (order === "load") {
      const t = view.pick(x, y, true);
      if (t?.type !== "transport") {
        toast("Toca un transporte propio.");
        return;
      }
      send({ type: "load", unitIds: selected, transportId: t.id });
    } else send({ type: order, unitIds: selected, x: p.x, y: p.y });
    setOrder(null);
    return;
  }
  const u = view.pick(x, y, true);
  if (u) {
    const add = multi || shift;
    select(
      add
        ? selected.includes(u.id)
          ? selected.filter((id) => id !== u.id)
          : [...selected, u.id]
        : [u.id],
    );
    if (u.garrisonedIn) {
      const building = map().buildings.find((b) => b.id === u.garrisonedIn);
      if (building) openBuilding(building);
    }
  } else {
    const building = view.pickBuilding(x, y);
    if (building) openBuilding(building);
    else if (!multi) select([]);
  }
}
function showGame() {
  playing = true;
  gameEnded = false;
  for (const id of ["startScreen", "lobbyScreen", "configScreen"])
    $(id).hidden = true;
  for (const id of ["hud", "gameTools"]) $(id).hidden = false;
  closePanels();
  view.setMap(map());
  setupCards();
  const spawn = map().spawns[me()?.team ?? 0];
  view.explored.fill(0);
  view.seenEvents.clear();
  view.zoom = innerHeight < 600 ? 1.8 : 1.45;
  view.focus(spawn.x, spawn.y);
  $("mapName").textContent = map().name;
  $("minimap").height = Math.round((320 * map().height) / map().width);
  updateSelection();
}
function onState(next) {
  state = next;
  if (!playing) showGame();
  const alive = new Set(state.units.map((u) => u.id));
  selected = selected.filter((id) => alive.has(id));
  view.setSelected(selected);
  view.setState(state, playerId);
  $("credits").textContent = Math.floor(me()?.credits ?? 0);
  $("blueScore").textContent = Math.ceil(state.tickets[0]);
  $("redScore").textContent = Math.ceil(state.tickets[1]);
  $("timer").textContent =
    `${String(Math.floor(state.time / 60)).padStart(2, "0")}:${String(Math.floor(state.time % 60)).padStart(2, "0")}`;
  $("connection").textContent = state.paused
    ? "PAUSA · CONEXIÓN"
    : mode === "solo"
      ? "LOCAL · IA"
      : networkStatus || "EN LÍNEA";
  $("sectorHud").replaceChildren();
  state.sectors.forEach((s, i) => {
    const el = document.createElement("span");
    el.className = "sector" + (s.owner !== null ? " owner" + s.owner : "");
    el.textContent = String(i + 1);
    el.title = `${s.name}: ${s.owner === null ? "neutral" : s.owner === 0 ? "azul" : "rojo"}`;
    $("sectorHud").append(el);
  });
  document
    .querySelectorAll(".unit-card")
    .forEach(
      (b) =>
        (b.disabled =
          !!me()?.surrendered ||
          (me()?.credits ?? 0) < UNIT_TYPES[b.dataset.unit].cost),
    );
  $("unitCount").textContent =
    `${state.units.filter((u) => u.team === me()?.team).length} aliadas`;
  updateSelection();
  updateOrderHint();
  updateTimeControls();
  updateRevealControl();
  updateBuilding();
  if (state.status === "finished" && !gameEnded) {
    gameEnded = true;
    pause = false;
    for (const id of ["pauseScreen", "helpScreen"]) $(id).hidden = true;
    $("resultTitle").textContent =
      state.winner === null
        ? "Empate"
        : state.winner === me()?.team
          ? "Victoria"
          : "Derrota";
    $("resultText").textContent =
      `${{ surrender: "Partida terminada por rendición.", time: "Se ha agotado el tiempo.", tickets: "Un equipo ha agotado sus puntos." }[state.reason] || "La operación ha concluido."} Azul ${Math.ceil(state.tickets[0])} · Rojo ${Math.ceil(state.tickets[1])}.`;
    $("resultScreen").hidden = false;
  }
}
function startSolo() {
  if (!view) {
    toast("Los gráficos no se han podido iniciar.");
    return;
  }
  savePrefs();
  connection?.leave();
  worker?.terminate();
  worker = new Worker("/client/solo-worker.mjs", { type: "module" });
  mode = "solo";
  playerId = "local";
  playing = false;
  pause = false;
  gameEnded = false;
  selected = [];
  groups = {};
  worker.onmessage = ({ data }) => {
    if (data.type === "state") onState(data.state);
    else commandFeedback(data);
  };
  worker.onerror = (e) => toast("La simulación no pudo arrancar: " + e.message);
  worker.postMessage({
    type: "start",
    name: $("playerName").value,
    deck: decks[$("deckSelect").value],
    config: matchConfig,
  });
}
function updateRoom(next) {
  room = next;
  const config = normalizeConfig(room.config);
  const selectedMap = getMap(config.mapId);
  $("lobbyConfigSummary").textContent =
    selectedMap.name +
    " · " +
    selectedMap.sizeLabel +
    " · " +
    selectedMap.width +
    " × " +
    selectedMap.height +
    " · " +
    config.startingResources +
    " recursos/jugador · ingresos " +
    config.incomeMultiplier +
    "× · " +
    config.maxUnits +
    " unidades en total · " +
    config.duration / 60 +
    " min · " +
    config.tickets +
    " puntos · Mostrar tropas enemigas: " +
    (config.allowEnemyReveal ? "permitido para cada jugador" : "no permitido");
  $("lobbyConfigVersion").textContent =
    "Ajustes " + room.configRevision + " · revisa antes de prepararte";
  $("editConfig").hidden = room.hostId !== playerId || playing;
  $("lobbyTitle").textContent =
    room.mode === "coop"
      ? "Dos mandos. Un mismo frente."
      : room.mode === "versus"
        ? "Duelo de comandantes"
        : "Operación individual";
  $("lobbyCode").textContent = room.code;
  $("playersList").replaceChildren();
  room.players.forEach((p) => {
    const row = document.createElement("div");
    row.className = "player-row";
    const n = document.createElement("span");
    n.textContent = `${p.team === 0 ? "Azul" : "Rojo"} · ${p.name}${p.id === playerId ? " (tú)" : ""}`;
    const status = document.createElement("span");
    status.textContent = !p.connected
      ? "Reconectando"
      : p.ready
        ? "Preparado"
        : "Preparándose";
    row.append(n, status);
    $("playersList").append(row);
  });
  const p = room.players.find((p) => p.id === playerId);
  $("teamSelect").value = String(p?.team ?? 0);
  $("teamSelect").disabled = room.mode !== "versus";
  $("readyButton").textContent = p?.ready
    ? "Cancelar preparación"
    : "Estoy preparado";
  $("readyButton").setAttribute("aria-pressed", String(!!p?.ready));
  $("startButton").disabled =
    room.hostId !== playerId ||
    room.players.length < (room.mode === "solo" ? 1 : 2) ||
    !room.players.every((p) => p.ready && p.connected);
  $("lobbyStatus").textContent =
    room.players.length < 2
      ? "Comparte el código o la invitación con tu amigo."
      : "Ambos deben marcarse preparados. El anfitrión inicia.";
  if (!playing) {
    $("startScreen").hidden = true;
    if (configIntent !== "edit" || $("configScreen").hidden)
      $("lobbyScreen").hidden = false;
  }
}
function onNetwork(data) {
  if (data.type === "welcome") {
    playerId = data.playerId;
    networkStatus = "EN LÍNEA";
  } else if (data.type === "room") {
    mode = data.room.mode;
    updateRoom(data.room);
  } else if (data.type === "state") onState(data.state);
  else if (
    data.type === "error" ||
    ["ack", "commandResult"].includes(data.type)
  ) {
    commandFeedback(data);
    if (!playing && !room) {
      $("configScreen").hidden = true;
      $("startScreen").hidden = false;
    }
  } else if (data.type === "ended") {
    gameEnded = true;
    pause = false;
    $("pauseScreen").hidden = true;
    $("lobbyScreen").hidden = true;
    $("resultTitle").textContent = "Sesión terminada";
    $("resultText").textContent = data.message;
    $("resultScreen").hidden = false;
  }
}
function makeConnection() {
  connection?.leave();
  connection = new Connection(onNetwork, (status) => {
    networkStatus = status;
    $("connection").textContent = status;
    $("lobbyStatus").textContent = status;
  });
  return connection;
}
function online(which) {
  if (!view) return;
  const endpoint = $("serverUrl").value.trim();
  if (!endpoint) {
    $("configScreen").hidden = true;
    $("startScreen").hidden = false;
    toast(
      "Introduce la dirección de un servidor multijugador publicado en «Conexión y gráficos».",
    );
    $("startScreen").querySelector("details").open = true;
    $("serverUrl").focus();
    return;
  }
  savePrefs();
  room = null;
  mode = which;
  $("configScreen").hidden = true;
  $("startScreen").hidden = false;
  $("bootStatus").textContent = "Conectando con el servidor…";
  playing = false;
  selected = [];
  groups = {};
  const c = makeConnection();
  try {
    c.connect(
      endpoint,
      which === "join"
        ? {
            type: "join",
            code: $("roomCode").value.trim().toUpperCase(),
            name: $("playerName").value,
            deck: decks[$("deckSelect").value],
          }
        : {
            type: "create",
            mode: which,
            name: $("playerName").value,
            deck: decks[$("deckSelect").value],
            config: matchConfig,
          },
    );
  } catch (e) {
    toast(e.message);
  }
}
function reset() {
  closePanels();
  worker?.terminate();
  worker = null;
  connection?.leave();
  connection = null;
  room = null;
  playing = false;
  state = null;
  multi = false;
  $("multiToggle").setAttribute("aria-pressed", "false");
  pause = false;
  gameEnded = false;
  select([]);
  setOrder(null);
  for (const id of [
    "hud",
    "gameTools",
    "selectionPanel",
    "mapPanel",
    "deployPanel",
    "resultScreen",
    "pauseScreen",
    "lobbyScreen",
    "configScreen",
    "unitPanel",
    "groupPanel",
    "helpScreen",
    "buildingPanel",
    "timeControls",
    "revealEnemies",
  ])
    $(id).hidden = true;
  $("app").classList.remove("reveal-allowed");
  $("startScreen").hidden = false;
}
function setPause(value) {
  pause = value;
  if (value) closePanels();
  if (mode === "solo") worker?.postMessage({ type: "pause", paused: value });
  $("pauseTitle").textContent = mode === "solo" ? "Pausa" : "Menú de operación";
  $("pauseText").textContent =
    mode === "solo"
      ? "La simulación está detenida."
      : "La partida compartida continúa mientras este menú está abierto.";
  $("surrenderButton").textContent =
    mode === "coop" ? "Retirarme y observar" : "Rendirse y terminar";
  $("surrenderButton").disabled = !!me()?.surrendered;
  $("exitOnline").hidden = mode === "solo";
  $("pauseScreen").hidden = !value;
}
$("orderHint").onclick = () => setOrder(null);
$("soloButton").onclick = () => openConfig("solo");
$("coopButton").onclick = () => openConfig("coop");
$("versusButton").onclick = () => openConfig("versus");
$("joinButton").onclick = () => online("join");
$("leaveLobby").onclick = reset;
$("newGameButton").onclick = reset;
$("exitOnline").onclick = reset;
$("readyButton").onclick = () =>
  connection?.send({
    type: "ready",
    ready: !room?.players.find((p) => p.id === playerId)?.ready,
    configRevision: room?.configRevision,
  });
$("startButton").onclick = () => connection?.send({ type: "start" });
$("teamSelect").onchange = () =>
  connection?.send({ type: "team", team: Number($("teamSelect").value) });
$("copyInvite").onclick = async () => {
  const url = new URL(location.origin);
  url.searchParams.set("room", room.code);
  if ($("serverUrl").value && $("serverUrl").value !== location.origin)
    url.searchParams.set("server", $("serverUrl").value);
  try {
    await navigator.clipboard.writeText(url.href);
    toast("Invitación copiada.");
  } catch {
    toast(
      "Código de sala: " + room.code + " · Servidor: " + $("serverUrl").value,
    );
  }
};
for (const [panel, button] of Object.entries(panelButtons))
  if (button) $(button).onclick = () => togglePanel(panel);
document.querySelectorAll("[data-speed]").forEach(
  (button) =>
    (button.onclick = () => {
      const message = { type: "time", speed: Number(button.dataset.speed) };
      if (mode === "solo") worker?.postMessage(message);
      else connection?.send(message);
    }),
);
$("revealEnemies").onclick = () => {
  if (!playing || gameEnded || !state?.config?.allowEnemyReveal || state.paused)
    return;
  const message = { type: "reveal", enabled: !state.revealEnemies };
  if (mode === "solo") worker?.postMessage(message);
  else connection?.send(message);
};
$("enterBuilding").onclick = () => {
  const infantry =
    state?.units
      .filter(
        (u) =>
          selected.includes(u.id) &&
          u.type === "infantry" &&
          !u.loadedIn &&
          !u.garrisonedIn,
      )
      .map((u) => u.id) ?? [];
  if (infantry.length)
    send({ type: "garrison", unitIds: infantry, buildingId: activeBuildingId });
  closePanels();
};
$("exitBuilding").onclick = () => {
  const ids =
    state?.units
      .filter(
        (u) => u.ownerId === playerId && u.garrisonedIn === activeBuildingId,
      )
      .map((u) => u.id) ?? [];
  if (ids.length) send({ type: "exit", unitIds: ids });
  closePanels();
};
$("closeDeploy").onclick = closePanels;
document
  .querySelectorAll("[data-close]")
  .forEach((b) => (b.onclick = closePanels));
$("overviewButton").onclick = () => view?.overview();
$("multiToggle").onclick = () => {
  multi = !multi;
  $("multiToggle").setAttribute("aria-pressed", String(multi));
};
$("zoomIn").onclick = () => view?.scale(1.2);
$("zoomOut").onclick = () => view?.scale(1 / 1.2);
$("focusButton").onclick = () => {
  const units = state?.units.filter((u) => selected.includes(u.id)) ?? [];
  if (units.length)
    view.focus(
      units.reduce((a, u) => a + u.x, 0) / units.length,
      units.reduce((a, u) => a + u.y, 0) / units.length,
    );
  else {
    const s = map().spawns[me()?.team ?? 0];
    view.focus(s.x, s.y);
  }
};
document.querySelectorAll("[data-order]").forEach(
  (b) =>
    (b.onclick = () => {
      const type = b.dataset.order;
      if (["stop", "unload", "resupply", "exit"].includes(type)) {
        send({
          type,
          unitIds:
            type === "exit"
              ? selected.filter((id) =>
                  state.units.some((u) => u.id === id && u.garrisonedIn),
                )
              : selected,
        });
        setOrder(null);
      } else setOrder(order === type ? null : type);
    }),
);
$("saveGroup").onclick = () => {
  savingGroup = !savingGroup;
  $("saveGroup").setAttribute("aria-pressed", String(savingGroup));
  if (savingGroup) toast("Toca 1, 2 o 3 para guardar la selección.");
};
document.querySelectorAll("[data-group]").forEach(
  (b) =>
    (b.onclick = () => {
      const n = b.dataset.group;
      if (savingGroup) {
        groups[n] = [...selected];
        savingGroup = false;
        $("saveGroup").setAttribute("aria-pressed", "false");
        b.classList.toggle("active", selected.length > 0);
        toast(`Grupo ${n}: ${selected.length} unidades`);
      } else {
        const ids =
          groups[n]?.filter((id) =>
            state?.units.some((u) => u.id === id && u.ownerId === playerId),
          ) ?? [];
        select(ids);
        if (!ids.length) toast("Este grupo está vacío. Usa Guardar selección.");
      }
    }),
);
$("minimap").addEventListener("pointerdown", (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  view?.focus(
    ((e.clientX - r.left) / r.width) * map().width,
    ((e.clientY - r.top) / r.height) * map().height,
  );
});
function help() {
  closePanels();
  if (playing && mode === "solo")
    worker?.postMessage({ type: "pause", paused: true });
  $("helpScreen").hidden = false;
}
for (const id of ["installHelp", "pauseHelp"]) $(id).onclick = help;
$("closeHelp").onclick = () => {
  $("helpScreen").hidden = true;
  if (playing && mode === "solo" && !pause)
    worker?.postMessage({ type: "pause", paused: false });
};
$("menuButton").onclick = () => setPause(true);
$("resumeButton").onclick = () => setPause(false);
$("surrenderButton").onclick = () => {
  setPause(false);
  send({ type: "surrender" });
};
$("qualitySelect").onchange = () => {
  savePrefs();
  toast("La calidad se aplicará al abrir de nuevo la aplicación.");
};
addEventListener("keydown", (e) => {
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.key === "Escape") {
    if (order || deployType) setOrder(null);
    else if (Object.keys(panelButtons).some((id) => !$(id).hidden))
      closePanels();
    else if (playing) setPause(!pause);
  }
  if (e.key.toLowerCase() === "m" && selected.length) setOrder("move");
  if (["1", "2", "3"].includes(e.key))
    document.querySelector(`[data-group="${e.key}"]`)?.click();
});
document.addEventListener("visibilitychange", () => {
  if (mode === "solo" && worker && playing) {
    if (document.hidden) worker.postMessage({ type: "pause", paused: true });
    else {
      setPause(true);
      $("pauseText").textContent =
        "La partida se pausó al cambiar de aplicación.";
    }
  }
});

function fillConfig(config) {
  $("configMap").value = config.mapId;
  $("configResources").value = config.startingResources;
  $("configIncome").value = config.incomeMultiplier;
  $("configUnits").value = config.maxUnits;
  $("configDuration").value = config.duration / 60;
  $("configTickets").value = config.tickets;
  $("configReveal").checked = config.allowEnemyReveal === true;
  $("configError").textContent = "";
  describeMap();
}
function describeMap() {
  const m = getMap($("configMap").value);
  $("configMapDescription").textContent =
    m.description +
    " · " +
    m.sectors.length +
    " objetivos · " +
    m.width +
    " × " +
    m.height;
}
function openConfig(intent) {
  configIntent = intent;
  closePanels();
  fillConfig(intent === "edit" ? normalizeConfig(room.config) : matchConfig);
  $("configTitle").textContent =
    intent === "edit"
      ? "Ajustes de la sala"
      : intent === "solo"
        ? "Operación contra la IA"
        : "Crear sala privada";
  $("confirmConfig").textContent =
    intent === "edit"
      ? "Aplicar a la sala"
      : intent === "solo"
        ? "Comenzar operación"
        : "Crear sala";
  $("startScreen").hidden = true;
  $("lobbyScreen").hidden = true;
  $("configScreen").hidden = false;
}
for (const m of MAPS) {
  const option = document.createElement("option");
  option.value = m.id;
  option.textContent = m.name + " — " + m.sizeLabel;
  $("configMap").append(option);
}
$("configMap").onchange = describeMap;
$("resetConfig").onclick = () => fillConfig(DEFAULT_CONFIG);
$("editConfig").onclick = () => openConfig("edit");
$("cancelConfig").onclick = () => {
  $("configScreen").hidden = true;
  $(configIntent === "edit" ? "lobbyScreen" : "startScreen").hidden = false;
};
$("configForm").onsubmit = (e) => {
  e.preventDefault();
  const result = validateConfig({
    mapId: $("configMap").value,
    startingResources: Number($("configResources").value),
    incomeMultiplier: Number($("configIncome").value),
    maxUnits: Number($("configUnits").value),
    duration: Number($("configDuration").value) * 60,
    tickets: Number($("configTickets").value),
    allowEnemyReveal: $("configReveal").checked,
  });
  if (!result.ok) {
    $("configError").textContent = result.error;
    return;
  }
  matchConfig = result.config;
  storage.set("fb-match-config", matchConfig);
  if (configIntent === "edit") {
    if (connection?.send({ type: "configure", config: matchConfig })) {
      $("configScreen").hidden = true;
      $("lobbyScreen").hidden = false;
    }
  } else if (configIntent === "solo") startSolo();
  else online(configIntent);
};
// Overlay controls own their pointer sequences. Closing a sheet cannot finish a map gesture.
document
  .querySelectorAll(
    "button,input,select,.secondary,#deployPanel,.screen,#selectionPanel,#hud,#gameTools",
  )
  .forEach((el) => {
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
    el.addEventListener("pointerup", (e) => e.stopPropagation());
  });

async function installPWA() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    const notice = () => {
      $("updateNotice").hidden = false;
      $("updateButton").onclick = () => {
        if (playing) {
          toast("Termina la partida antes de actualizar.");
          return;
        }
        reg.waiting?.postMessage({ type: "SKIP_WAITING" });
      };
    };
    if (reg.waiting) notice();
    reg.addEventListener("updatefound", () =>
      reg.installing?.addEventListener("statechange", () => {
        if (reg.waiting && navigator.serviceWorker.controller) notice();
      }),
    );
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data?.type === "PWA_CACHE_READY")
        $("bootStatus").textContent =
          "Archivos guardados. Modo individual disponible sin conexión.";
      if (e.data?.type === "PWA_CACHE_ERROR")
        $("bootStatus").textContent =
          "No se completó la descarga para jugar sin conexión.";
    });
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController) location.reload();
      hadController = true;
    });
  } catch {
    $("bootStatus").textContent =
      "Instalación sin conexión no disponible en este origen.";
  }
}
try {
  view = new Battlefield($("viewport"), $("labels"), $("qualitySelect").value);
  bindControls($("viewport"), view, tap);
  $("bootStatus").textContent = "Escenario listo · 9 categorías de unidades";
  setInterval(() => {
    if (playing) {
      view.drawMinimap($("minimap"));
      $("fps").textContent = `${view.fps} FPS`;
    }
  }, 500);
  installPWA();
  const params = new URLSearchParams(location.search);
  if (params.get("room")) $("roomCode").value = params.get("room").slice(0, 8);
  if (params.get("server")) {
    const endpoint = new URL(params.get("server"));
    if (["https:", "http:"].includes(endpoint.protocol))
      $("serverUrl").value = endpoint.origin;
  }
  const saved = makeConnection();
  if (!saved.resumeSaved()) {
    connection = null;
  } else {
    mode = "online";
    toast("Recuperando tu sesión…");
  }
} catch (e) {
  $("bootStatus").textContent =
    "No se pudieron iniciar los gráficos 3D. Se necesita WebGL 2. " + e.message;
  console.error(e);
}
// Read-only diagnostics for reproducible browser QA; no state-changing debug API.
window.__FB__ = {
  get state() {
    return state;
  },
  get playerId() {
    return playerId;
  },
  get selected() {
    return [...selected];
  },
  get fps() {
    return view?.fps;
  },
  get renderStats() {
    return view ? { ...view.renderer.info.render } : null;
  },
  get camera() {
    return view ? { ...view.center, zoom: view.zoom } : null;
  },
  project: (x, y, h) => view?.screenAt(x, y, h),
  projectUnit: (unit) => view?.unitScreen(unit),
  projectBuilding: (building) => view?.buildingScreen(building),
};
if (!$("serverUrl").value)
  fetch("/health", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((h) => {
      if (h?.service === "frente-boreal" && !$("serverUrl").value)
        $("serverUrl").value = location.origin;
    })
    .catch(() => {});
