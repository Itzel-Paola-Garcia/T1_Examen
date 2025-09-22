// js/control.js
const DEVICES_API = "https://68cc9d85716562cf5077edc6.mockapi.io/api/v1/devices";
const STATUS_API  = "https://68cc9d85716562cf5077edc6.mockapi.io/api/v1/status";

const POLL_INTERVAL = 2000;
const SENSOR_REPORT_INTERVAL = 120000; // 2 min
const OBSTACLE_INTERVAL = 300000; // 5 min
const CHARGE_STEP_MS = 1000; // incremento cada 1s
const CHARGE_STEP_AMOUNT = 5; // +5 por segundo

const IMG_ROBOT = "images/robot.jpg";
const IMG_DOCK  = "images/dock.jpg";
const IMG_SENSOR= "images/sensor.jpg";

const roomContent = document.getElementById("roomContent");
const roomTabs = document.getElementById("roomTabs");
let currentRoom = "Cocina";

roomTabs.addEventListener("click", (ev)=>{
  const btn = ev.target.closest("button");
  if(!btn) return;
  [...roomTabs.querySelectorAll("button")].forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  currentRoom = btn.getAttribute("data-room");
  renderRoom(currentRoom);
});

let devicesCache = [];
let chargingIntervals = {};   // robotId -> intervalId
let cleaningIntervals = {};   // robotId -> intervalId
let dockLockMap = {};         // dockId -> timestamp until locked

// Fetch wrappers
async function apiGet(url) {
  const r = await fetch(url); if(!r.ok) throw new Error("GET failed " + url); return r.json();
}
async function apiPut(url, payload) {
  const r = await fetch(url, { method:"PUT", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload) });
  if(!r.ok) throw new Error("PUT failed " + url); return r.json();
}
async function apiPost(url, payload) {
  const r = await fetch(url, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload) });
  if(!r.ok) throw new Error("POST failed " + url); return r.json();
}

// Utils robustos
function getField(obj, ...keys) {
  for (const k of keys) {
    if (!obj) continue;
    if (Object.prototype.hasOwnProperty.call(obj,k)) return obj[k];
    const low = k.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(obj, low)) return obj[low];
  }
  return undefined;
}
function setField(obj, key, value) { obj[key] = value; }

// time helpers
function nowISO(){ return new Date().toISOString(); }
function mexicoTimeStr(iso){ try { return new Date(iso).toLocaleString("es-MX",{timeZone:"America/Mexico_City"}); } catch { return iso; } }

// load devices from API
async function refreshDevices(){
  try {
    devicesCache = await apiGet(DEVICES_API);
    renderRoom(currentRoom);
  } catch (err) { console.error("refreshDevices:", err); }
}

// helpers: robots by room
function getRobotDevicesForRoom(roomName) {
  return devicesCache.filter(d => {
    const tipo = (getField(d,"tipo","Tipo","type")||"").toString().toLowerCase();
    const ubic = getField(d,"Ubicacion","ubicacion","location") || getUbFromName(getField(d,"name"));
    return tipo === "robot" && (ubic||"").toString().toLowerCase() === (roomName||"").toString().toLowerCase();
  });
}
function getUbFromName(name="") {
  name = (name||"").toLowerCase();
  if (name.includes("cocina")) return "Cocina";
  if (name.includes("baño") || name.includes("bano")) return "Baño";
  if (name.includes("cuarto")) return "Cuarto";
  if (name.includes("sala")) return "Sala";
  return "";
}

// find associated dock/sensor
function findAssociatedDevices(robot) {
  const robotId = robot.id;
  const ubic = robot.Ubicacion || robot.ubicacion || getUbFromName(robot.name);
  const matches = devicesCache.filter(d => {
    const parent = getField(d, "parentId", "parent", "parent_id");
    if (parent == robotId) return true;
    const nm = (getField(d,"name","Nombre")||"").toString().toLowerCase();
    if (ubic) {
      if (nm === ("dock " + ubic).toLowerCase() || nm === ("sensor " + ubic).toLowerCase()) return true;
    }
    return false;
  });
  const dock = matches.find(m => (getField(m,"tipo","Tipo","type")||"").toString().toLowerCase() === "dock" || (m.name||"").toLowerCase().startsWith("dock")) || null;
  const sensor = matches.find(m => (getField(m,"tipo","Tipo","type")||"").toString().toLowerCase() === "sensor" || (m.name||"").toLowerCase().startsWith("sensor")) || null;
  return { dock, sensor };
}

// Render room
function renderRoom(roomName) {
  roomContent.innerHTML = "";
  const robots = getRobotDevicesForRoom(roomName);
  if (robots.length === 0) {
    roomContent.innerHTML = `<div class="alert alert-info">No hay robots registrados en <strong>${roomName}</strong>.</div>`;
    return;
  }
  robots.forEach(robot => {
    const { dock, sensor } = findAssociatedDevices(robot);
    const card = buildRobotCard(robot, dock, sensor);
    roomContent.appendChild(card);
  });
}

// Build card DOM
function buildRobotCard(robot, dock, sensor) {
  const robotId = robot.id;
  const title = `${robot.name} — ${robotId}`;

  const rActivo = parseActivo(robot);
  const rModo = robot.Modo || robot.modo || "Reposo";
  const rBateria = Number(getField(robot,"Bateria","bateria","battery") ?? null);
  const rDirt = Number(getField(robot,"Nivel_suciedad","nivel_suciedad","dirtLevel") ?? 0);
  const rObst = getField(robot,"Obstaculo","obstaculo") || false;

  const container = document.createElement("div");
  container.className = "device-card";

  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-2">
      <div><strong>${title}</strong><div class="small text-muted">Último: ${mexicoTimeStr(robot.Ultimo_uso||robot.ultimo_uso||robot.lastSeen||robot.createdAt||"")}</div></div>
      <div class="small text-muted">Modo: ${rModo}</div>
    </div>
    <div class="device-figure">
      <div class="text-center">
        <img src="${IMG_ROBOT}" alt="robot" />
        <div class="mt-2">
          <i class="bi ${rActivo ? 'bi-lightbulb-fill text-warning' : 'bi-lightbulb'} icon-btn" title="Activar/Desactivar robot" data-role="toggle-robot" data-id="${robotId}"></i>
        </div>
        <div class="mt-2">
          <i class="bi bi-brush icon-btn me-2" title="Toggle limpieza" data-role="toggle-brush" data-id="${robotId}"></i>
        </div>
        <div class="mt-2" id="robotAlerts-${robotId}">
          ${ rObst ? `<span class="badge bg-warning text-dark alert-badge" data-role="clear-obstacle" data-id="${robotId}"><i class="bi bi-exclamation-triangle"></i> Obstáculo</span>` : '' }
          ${ (rBateria !== null && rBateria < 30) ? `<span class="badge bg-danger text-white alert-badge" data-role="low-battery" data-id="${robotId}"><i class="bi bi-battery-half"></i> Batería baja (${rBateria}%)</span>` : '' }
        </div>
        <div class="mt-2 small text-muted">Batería: ${rBateria !== null ? rBateria + '%' : 'N/A'}</div>
        <div class="small text-muted">Suciedad: ${rDirt}%</div>
      </div>

      <div class="text-center">
        <img src="${IMG_DOCK}" alt="dock" />
        <div class="mt-2">
          <i class="bi ${dock && parseActivo(dock) ? 'bi-lightbulb-fill text-warning' : 'bi-lightbulb'} icon-btn" title="Activar/Desactivar dock" data-role="toggle-dock" data-id="${(dock && dock.id) || ''}"></i>
        </div>
        <div class="mt-2 small text-muted">Modo: ${dock ? (dock.Modo || dock.modo || 'Desconocido') : 'No encontrado'}</div>
      </div>

      <div class="text-center">
        <img src="${IMG_SENSOR}" alt="sensor" />
        <div class="mt-2">
          <i class="bi ${sensor && parseActivo(sensor) ? 'bi-lightbulb-fill text-warning' : 'bi-lightbulb'} icon-btn" title="Activar/Desactivar sensor" data-role="toggle-sensor" data-id="${(sensor && sensor.id) || ''}"></i>
        </div>
        <div class="mt-2 small text-muted">Modo: ${sensor ? (sensor.Modo || sensor.modo || 'Desconocido') : 'No encontrado'}</div>
      </div>
    </div>
  `;

  container.addEventListener("click", async (ev) => {
    const t = ev.target.closest("[data-role]");
    if(!t) return;
    const role = t.getAttribute("data-role");
    const id = t.getAttribute("data-id");
    switch (role) {
      case "toggle-robot": await toggleRobotActive(robotId); break;
      case "toggle-brush": await toggleBrush(robotId); break;
      case "clear-obstacle": await clearObstacle(robotId); break;
      case "low-battery": await handleLowBatteryClick(robotId); break;
      case "toggle-dock": await toggleDockActive(id); break;
      case "toggle-sensor": await toggleSensorActive(id); break;
    }
  });

  return container;
}

// parse "Activo"
function parseActivo(dev) {
  const a = getField(dev,"Activo","activo","isOnline");
  if (a === undefined || a === null) return true;
  if (typeof a === "boolean") return a;
  if (typeof a === "string") return a.toLowerCase() === "si" || a.toLowerCase() === "true";
  return Boolean(a);
}

// update device
async function putDevice(device) {
  const id = device.id;
  if (device.Activo !== undefined) device.activo = device.Activo ? "si" : "no";
  if (device.Bateria !== undefined) device.bateria = device.Bateria;
  if (device.Nivel_suciedad !== undefined) device.nivel_suciedad = device.Nivel_suciedad;
  device.Ultimo_uso = nowISO();
  const res = await apiPut(`${DEVICES_API}/${id}`, device);
  try { await apiPost(STATUS_API, { deviceId: id, timestamp: nowISO(), battery: device.Bateria, dirtLevel: device.Nivel_suciedad, obstacle: device.Obstaculo, mode: device.Modo, note: "auto update" }); } catch(_) {}
  return res;
}

// --- ACTIONS ---
async function toggleRobotActive(robotId){
  const robot = devicesCache.find(r=>r.id==robotId);
  if(!robot) return;
  robot.Activo = !parseActivo(robot);
  await putDevice(robot);
  renderRoom(currentRoom);
}
async function toggleBrush(robotId){
  if(cleaningIntervals[robotId]){
    clearInterval(cleaningIntervals[robotId]);
    delete cleaningIntervals[robotId];
    const robot = devicesCache.find(r=>r.id==robotId);
    if(robot) robot.Modo = "Reposo";
    await putDevice(robot);
  } else startCleaning(robotId);
  renderRoom(currentRoom);
}
async function clearObstacle(robotId){
  const robot = devicesCache.find(r=>r.id==robotId);
  if(!robot) return;
  robot.Obstaculo = false;
  await putDevice(robot);
  renderRoom(currentRoom);
}
async function handleLowBatteryClick(robotId){
  const robot = devicesCache.find(r=>r.id==robotId);
  if(!robot) return;
  const { dock } = findAssociatedDevices(robot);
  if(!dock) return alert("No hay dock para cargar este robot");
  startCharging(robotId, dock.id);
}
async function startCharging(robotId, dockId){
  if(chargingIntervals[robotId]) return;
  const robot = devicesCache.find(r=>r.id==robotId);
  if(!robot) return;
  chargingIntervals[robotId] = setInterval(async ()=>{
    robot.Bateria = Math.min(100, (robot.Bateria||0) + CHARGE_STEP_AMOUNT);
    await putDevice(robot);
    if(robot.Bateria>=100){
      clearInterval(chargingIntervals[robotId]);
      delete chargingIntervals[robotId];
    }
    renderRoom(currentRoom);
  }, CHARGE_STEP_MS);
}
async function toggleDockActive(dockId){
  const dock = devicesCache.find(d=>d.id==dockId);
  if(!dock) return;
  dock.Activo = !parseActivo(dock);
  await putDevice(dock);
  renderRoom(currentRoom);
}
async function toggleSensorActive(sensorId){
  const sensor = devicesCache.find(d=>d.id==sensorId);
  if(!sensor) return;
  sensor.Activo = !parseActivo(sensor);
  await putDevice(sensor);
  renderRoom(currentRoom);
}
function startCleaning(robotId){
  const robot = devicesCache.find(r=>r.id==robotId);
  if(!robot) return;
  robot.Modo = "Limpieza";
  cleaningIntervals[robotId] = setInterval(async ()=>{
    robot.Nivel_suciedad = Math.max(0,(robot.Nivel_suciedad||0)-1);
    await putDevice(robot);
    if(robot.Nivel_suciedad<=0) stopCleaning(robotId);
    renderRoom(currentRoom);
  },1000);
}
function stopCleaning(robotId){
  if(cleaningIntervals[robotId]) clearInterval(cleaningIntervals[robotId]);
  delete cleaningIntervals[robotId];
  const robot = devicesCache.find(r=>r.id==robotId);
  if(robot) robot.Modo = "Reposo";
  putDevice(robot);
}

// --- Cycles ---
async function sensorReportCycle(){ 
  const sensors = devicesCache.filter(d=>parseActivo(d) && ((getField(d,"tipo","Tipo")||"").toLowerCase()=="sensor"));
  for(const s of sensors){
    try{
      await apiPost(STATUS_API,{ deviceId: s.id, timestamp: nowISO(), dirtLevel: s.Nivel_suciedad||0, note:"sensor report" });
    }catch{}
  }
}
async function obstacleCycle(){
  const robots = devicesCache.filter(d=>parseActivo(d) && ((getField(d,"tipo","Tipo")||"").toLowerCase()=="robot"));
  for(const r of robots){
    if(Math.random()<0.1){ r.Obstaculo = true; await putDevice(r);}
  }
}

// Kickoff
refreshDevices(); // carga inicial
// NO refresco automático cada 2s
// setInterval(refreshDevices, POLL_INTERVAL);
setInterval(sensorReportCycle, SENSOR_REPORT_INTERVAL);
setInterval(obstacleCycle, OBSTACLE_INTERVAL);
setTimeout(sensorReportCycle, 5000);

