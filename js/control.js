// js/control.js
const DEVICES_API = "https://68cc9d85716562cf5077edc6.mockapi.io/api/v1/devices";
const STATUS_API  = "https://68cc9d85716562cf5077edc6.mockapi.io/api/v1/status";

const POLL_INTERVAL = 2000;
const SENSOR_REPORT_INTERVAL = 120000; // 2 min
const OBSTACLE_INTERVAL = 300000; // 5 min
const CHARGE_STEP_MS = 1000; // incremento cada 1s
const CHARGE_STEP_AMOUNT = 5; // +5 por segundo

const IMG_ROBOT = "/images/robot.jpg";
const IMG_DOCK  = "/images/dock.jpg";
const IMG_SENSOR= "/images/sensor.jpg";

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
let chargingIntervals = {};   
let cleaningIntervals = {};   
let


