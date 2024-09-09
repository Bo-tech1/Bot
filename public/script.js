let websocket = new WebSocket("ws://localhost:3000");
let botRunning = false;

websocket.onopen = function () {
    console.log("WebSocket connection to server established.");
};

websocket.onmessage = function (event) {
    const data = JSON.parse(event.data);
    if (data.type === 'update') {
        console.log(`Signal update: ${data.message}`);
        playSound();
        document.getElementById('signals').innerText = data.message;


    }
};

function startBot() {
    if (!botRunning) {
        botRunning = true;
        websocket.send(JSON.stringify({ type: 'start' }));
    }
}

function stopBot() {
    if (botRunning) {
        botRunning = false;
        websocket.send(JSON.stringify({ type: 'stop' }));
    }
}

function playSound() {
    const audio = new Audio('alert.mp3'); // Замените на путь к вашему звуковому файлу
    audio.play();
}

document.getElementById('start-btn').addEventListener('click', startBot);
document.getElementById('stop-btn').addEventListener('click', stopBot);

function updateMarketHours() {
    const marketOpenTime = moment.tz("03:00", "Europe/Moscow");
    const marketCloseTime = moment.tz("23:45", "Europe/Moscow");
    const now = moment.tz("Europe/Moscow");

    const marketHours = marketCloseTime.diff(now, 'minutes');
    document.getElementById('market-hours').innerText = `Market hours left: ${marketHours} minutes`;

    const localTime = now.format('YYYY-MM-DD HH:mm:ss');
    document.getElementById('local-time').innerText = `Local time: ${localTime}`;
}

setInterval(updateMarketHours, 60000);
updateMarketHours();