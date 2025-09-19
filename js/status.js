const DEVICES_API = "https://68cc9d85716562cf5077edc6.mockapi.io/api/v1/devices";
const tableBody = document.querySelector("#devicesTable tbody");

// --- utils del proyecto ---
function getField(obj, ...keys) {
  for (const k of keys) {
    if (!obj) continue;
    if (Object.prototype.hasOwnProperty.call(obj,k)) return obj[k];
    const low = k.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(obj, low)) return obj[low];
  }
  return undefined;
}

function mexicoTimeStr(iso){ 
  try { return new Date(iso).toLocaleString("es-MX",{timeZone:"America/Mexico_City"}); } 
  catch { return iso; } 
}

// --- determinar status visible ---
function getDeviceStatus(dev) {
  const tipo = (getField(dev,"tipo","Tipo","type")||"").toLowerCase();
  let status = getField(dev,"Modo","modo") || "Desconocido";

  if(tipo === "robot") {
    const activo = getField(dev,"Activo","activo","isOnline");
    if(activo === false || activo === "no") status = "Apagado";
  }
  if(tipo === "dock") {
    const activo = getField(dev,"Activo","activo","isOnline");
    if(activo === false || activo === "no") status = "Apagado";
  }
  if(tipo === "sensor") {
    const activo = getField(dev,"Activo","activo","isOnline");
    if(activo === false || activo === "no") status = "Apagado";
  }

  return status;
}

// --- render tabla ---
async function fetchDevices(){
  try {
    const res = await fetch(DEVICES_API);
    if(!res.ok) throw new Error("Error fetching devices");
    const devices = await res.json();

    tableBody.innerHTML = "";

    devices.forEach(dev => {
      const tipo = (getField(dev,"tipo","Tipo","type")||"").toLowerCase();
      if(!["robot","dock","sensor"].includes(tipo)) return;

      const status = getDeviceStatus(dev);
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${getField(dev,"name","Nombre")||"-"}</td>
        <td>${tipo.charAt(0).toUpperCase()+tipo.slice(1)}</td>
        <td>${dev.id}</td>
        <td>${status}</td>
        <td>${mexicoTimeStr(getField(dev,"Ultimo_uso","ultimo_uso","lastSeen","createdAt"))}</td>
      `;
      tableBody.appendChild(row);
    });

  } catch(err) {
    console.error("fetchDevices:", err);
  }
}

// --- inicial ---
fetchDevices();
setInterval(fetchDevices, 10000);
