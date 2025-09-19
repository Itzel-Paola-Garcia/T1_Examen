// js/devices.js
// Admin CRUD - conectado a MockAPI devices
const API_URL = "https://68cc9d85716562cf5077edc6.mockapi.io/api/v1/devices";
const STATUS_API = "https://68cc9d85716562cf5077edc6.mockapi.io/api/v1/status";

const robotForm = document.getElementById("robotForm");
const robotsBody = document.getElementById("robotsBody");
const editModalEl = document.getElementById('editModal');
const bootstrapEditModal = new bootstrap.Modal(editModalEl);
const editForm = document.getElementById('editForm');

// Helpers robustos (manejar variaciones de keys)
function getField(obj, ...keys) {
  for (const k of keys) {
    if (!obj) continue;
    if (Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
    const low = k.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(obj, low)) return obj[low];
  }
  return undefined;
}
function setField(obj, key, value) {
  obj[key] = value;
}

// Fecha ISO y formato CDMX
function nowISO() { return new Date().toISOString(); }
function formatMexico(iso) {
  try { return new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City" }); }
  catch { return iso; }
}

// API wrappers
async function fetchAllDevices() {
  const r = await fetch(API_URL);
  if (!r.ok) throw new Error("Error al obtener devices");
  return r.json();
}
async function fetchDevice(id) {
  const r = await fetch(`${API_URL}/${id}`);
  if (!r.ok) throw new Error("Error al obtener device " + id);
  return r.json();
}
async function createDevice(payload) {
  const r = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error("Error creando device");
  const j = await r.json();
  // log
  try { await fetch(STATUS_API, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ deviceId: j.id, timestamp: nowISO(), note: "Created" }) }); } catch(_) {}
  return j;
}
async function updateDevice(id, payload) {
  const r = await fetch(`${API_URL}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error("Error actualizando device " + id);
  const j = await r.json();
  try { await fetch(STATUS_API, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ deviceId: j.id, timestamp: nowISO(), note: "Updated" }) }); } catch(_) {}
  return j;
}
async function deleteDevice(id) {
  const r = await fetch(`${API_URL}/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Error borrando device " + id);
  try { await fetch(STATUS_API, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ deviceId: id, timestamp: nowISO(), note: "Deleted" }) }); } catch(_) {}
  return r.json();
}

// obtener ubicación a partir del nombre
function getUbicacionFromName(name = "") {
  name = (name || "").toLowerCase();
  if (name.includes("cocina")) return "Cocina";
  if (name.includes("baño") || name.includes("bano")) return "Baño";
  if (name.includes("cuarto")) return "Cuarto";
  if (name.includes("sala")) return "Sala";
  return "General";
}

// --- Render tabla de robots
async function loadRobots() {
  try {
    const devices = await fetchAllDevices();

    // Filtrar robots (soporta keys 'tipo','Tipo','type')
    const robots = devices.filter(d => {
      const t = getField(d, "tipo", "Tipo", "type");
      return (t && t.toString().toLowerCase() === "robot");
    });

    robotsBody.innerHTML = "";
    robots.forEach(r => {
      const id = getField(r, "id", "ID");
      const name = getField(r, "name", "Nombre") || "";
      const ubicacion = getField(r, "Ubicacion", "ubicacion", "location") || getUbicacionFromName(name);
      const ultimo = getField(r, "Ultimo_uso", "ultimo_uso", "lastSeen") || r.createdAt || nowISO();

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${id}</td>
        <td>${name}</td>
        <td>${ubicacion}</td>
        <td>${formatMexico(ultimo)}</td>
        <td class="text-center">
          <button class="btn btn-sm btn-warning me-1" data-id="${id}" data-action="edit"><i class="bi bi-pencil"></i> Editar</button>
          <button class="btn btn-sm btn-danger" data-id="${id}" data-action="delete"><i class="bi bi-trash"></i> Eliminar</button>
        </td>
      `;
      robotsBody.appendChild(tr);
    });

  } catch (err) {
    console.error(err);
    alert("Error cargando robots. Revisa consola.");
  }
}

// --- Eliminar robot y asociados
async function deleteRobotAndAssociated(robotId) {
  if (!confirm("¿Seguro que deseas eliminar este robot y sus dispositivos asociados?")) return;
  try {
    const devices = await fetchAllDevices();
    const robot = devices.find(d => getField(d, "id", "ID") == robotId);
    const ubicacion = robot ? (getField(robot, "Ubicacion", "ubicacion") || getUbicacionFromName(getField(robot, "name"))) : null;

    const toDelete = new Map();
    devices.forEach(d => {
      const did = getField(d, "id", "ID");
      const parent = getField(d, "parentId", "parent", "parent_id");
      const dname = (getField(d, "name", "Nombre") || "").toString().toLowerCase();

      if (did == robotId) toDelete.set(did, true);
      if (parent == robotId) toDelete.set(did, true);
      if (ubicacion) {
        if (dname === ("dock " + ubicacion).toLowerCase()) toDelete.set(did, true);
        if (dname === ("sensor " + ubicacion).toLowerCase()) toDelete.set(did, true);
      }
    });

    for (const id of toDelete.keys()) {
      try { await deleteDevice(id); } catch (err) { console.warn("No se pudo borrar id:", id, err); }
    }
    await loadRobots();
  } catch (err) {
    console.error(err);
    alert("Error al borrar. Revisa la consola.");
  }
}

// --- Abrir modal editar
async function openEditModal(robotId) {
  try {
    const robot = await fetchDevice(robotId);
    const currentName = getField(robot, "name", "Nombre") || "";
    document.getElementById('editRobotId').value = robotId;
    document.getElementById('editRobotName').value = currentName;
    bootstrapEditModal.show();
  } catch (err) {
    console.error(err);
    alert("Error al abrir editor.");
  }
}

// --- Guardar edición (robot + asociados)
async function saveEdit(e) {
  e.preventDefault();
  const newName = document.getElementById('editRobotName').value;
  const robotId = document.getElementById('editRobotId').value;
  if (!newName || !robotId) return alert("Nombre o ID inválido");
  const newUbic = getUbicacionFromName(newName);
  const fecha = nowISO();

  try {
    const robot = await fetchDevice(robotId);
    const updatedRobot = { ...robot };
    setField(updatedRobot, "name", newName);
    setField(updatedRobot, "tipo", "robot");
    setField(updatedRobot, "Ubicacion", newUbic);
    setField(updatedRobot, "Ultimo_uso", fecha);
    await updateDevice(robotId, updatedRobot);

    // actualizar asociados
    const devices = await fetchAllDevices();
    const oldUbic = getField(robot, "Ubicacion", "ubicacion") || getUbicacionFromName(getField(robot, "name", ""));
    const associated = devices.filter(d => {
      const dParent = getField(d, "parentId", "parent", "parent_id");
      const dname = (getField(d, "name", "Nombre") || "").toString();
      if (dParent == robotId) return true;
      if (oldUbic && (dname.toLowerCase() === ("Dock " + oldUbic).toLowerCase() || dname.toLowerCase() === ("Sensor " + oldUbic).toLowerCase())) return true;
      return false;
    });

    for (const a of associated) {
      const aid = getField(a, "id", "ID");
      const type = (getField(a, "tipo", "Tipo", "type") || "").toString().toLowerCase();
      const updated = { ...a };
      if (type === "dock" || (getField(a, "name")||"").toLowerCase().includes("dock")) {
        setField(updated, "name", "Dock " + newUbic);
      } else if (type === "sensor" || (getField(a, "name")||"").toLowerCase().includes("sensor")) {
        setField(updated, "name", "Sensor " + newUbic);
      }
      setField(updated, "Ubicacion", newUbic);
      setField(updated, "Ultimo_uso", fecha);
      try { await updateDevice(aid, updated); } catch (err) { console.warn("No se pudo actualizar asociado", aid, err); }
    }

    bootstrapEditModal.hide();
    await loadRobots();
  } catch (err) {
    console.error(err);
    alert("Error al guardar cambios.");
  }
}

// --- Agregar robot (y crear dock + sensor automáticamente)
robotForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const sel = document.getElementById("robotName");
  const name = sel.value;
  if (!name) return alert("Selecciona un robot.");
  const ubic = getUbicacionFromName(name);

  try {
    // VALIDAR: solo 1 robot por ubicacion
    const devices = await fetchAllDevices();
    if (devices.some(d => {
      const t = getField(d, "tipo", "Tipo", "type");
      const u = getField(d, "Ubicacion", "ubicacion", "location") || getUbicacionFromName(getField(d,"name",""));
      return (t && t.toString().toLowerCase()==="robot" && u && u.toLowerCase() === ubic.toLowerCase());
    })) {
      return alert(`Ya existe un robot en ${ubic}.`);
    }

    const fecha = nowISO();
    const robotPayload = {
      name: name,
      tipo: "robot",
      Ubicacion: ubic,
      Activo: true,
      Ultimo_uso: fecha,
      Bateria: Math.floor(Math.random() * 100) + 1,
      Nivel_suciedad: Math.floor(Math.random() * 100) + 1,
      Obstaculo: false,
      Modo: "Reposo"
    };
    const createdRobot = await createDevice(robotPayload);
    const robotId = getField(createdRobot, "id", "ID");

    const dockPayload = {
      parentId: robotId,
      name: "Dock " + ubic,
      tipo: "dock",
      Ubicacion: ubic,
      Activo: true,
      Ultimo_uso: fecha,
      Bateria: createdRobot.Bateria || createdRobot.bateria || null,
      Nivel_suciedad: null,
      Obstaculo: null,
      Modo: "Reposo"
    };
    await createDevice(dockPayload);

    const sensorPayload = {
      parentId: robotId,
      name: "Sensor " + ubic,
      tipo: "sensor",
      Ubicacion: ubic,
      Activo: true,
      Ultimo_uso: fecha,
      Bateria: null,
      Nivel_suciedad: createdRobot.Nivel_suciedad || createdRobot.nivel_suciedad || null,
      Obstaculo: null,
      Modo: "Reportando"
    };
    await createDevice(sensorPayload);

    robotForm.reset();
    await loadRobots();
  } catch (err) {
    console.error(err);
    alert("Error creando dispositivos. Revisa consola.");
  }
});

// Delegación para Edit/Delete
robotsBody.addEventListener("click", (ev) => {
  const btn = ev.target.closest("button");
  if (!btn) return;
  const id = btn.getAttribute("data-id");
  const action = btn.getAttribute("data-action");
  if (action === "delete") deleteRobotAndAssociated(id);
  if (action === "edit") openEditModal(id);
});

// submit modal save
editForm.addEventListener("submit", saveEdit);

// Inicializar
loadRobots();
