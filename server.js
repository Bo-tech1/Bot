const WebSocket = require('ws');
const { ADX, RSI } = require('technicalindicators');
const moment = require('moment-timezone');
const express = require('express');
const http = require('http');

const app_id = 64005;
const token = "dgshFSkhx27Qjs0";
const symbols = [
    "frxAUDCAD", "frxAUDCHF", "frxAUDNZD", "frxEURNZD", "frxGBPCAD", "frxGBPCHF", "frxGBPNZD",
    "frxNZDJPY", "frxNZDUSD", "frxUSDMXN", "frxUSDPLN", "frxAUDJPY", "frxAUDUSD", "frxEURAUD",
    "frxEURCAD", "frxEURCHF", "frxEURGBP", "frxEURJPY", "frxEURUSD", "frxGBPAUD", "frxGBPJPY",
    "frxGBPUSD", "frxUSDCAD", "frxUSDCHF", "frxUSDJPY"
];

const adxPeriod = 14;
const rsiPeriod = 14;
const crsiPeriod = 3;

const candlesHistory = {};
const signals = {};

let botRunning = false;
let websocket = null;

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

wss.on('connection', ws => {
    console.log("Client connected");

    ws.on('message', message => {
        console.log(`Received message: ${message}`);
        const command = JSON.parse(message);

        if (command.type === 'start') {
            startBot();
        } else if (command.type === 'stop') {
            stopBot();
        }
    });

    ws.on('close', () => {
        console.log("Client disconnected");
        stopBot();
    });

    function startBot() {
        if (!botRunning) {
            botRunning = true;
            websocket = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${app_id}&token=${token}`);

            websocket.onopen = function () {
                console.log("WebSocket connection to Deriv established.");
                symbols.forEach(symbol => {
                    candlesHistory[symbol] = [];
                    signals[symbol] = null;
                    subscribeToCandles(symbol);
                });
            };

            function subscribeToCandles(symbol) {
                const request = {
                    ticks_history: symbol,
                    adjust_start_time: 1,
                    count: 500,
                    end: "latest",
                    granularity: 60,
                    style: "candles",
                    subscribe: 1
                };
                console.log(`Subscribing to candles for ${symbol}`);
                websocket.send(JSON.stringify(request));
            }

            function checkZebraPattern(candles) {
                if (candles.length < 6) return false;

                for (let i = 0; i < 6; i++) {
                    const current = candles[i];
                    const previous = candles[i + 1];

                    if ((i % 2 === 0 && current.color !== 'red') || (i % 2 !== 0 && current.color !== 'green')) {
                        return false;
                    }
                }
                return true;
            }

            function determineSignal(adxValue, rsiValue, crsiValue) {
                if (adxValue > 25 && rsiValue < 70 && rsiValue > 30 && crsiValue < 70 && crsiValue > 30) {
                    return 'BUY';
                }
                return 'SELL';
            }

            function checkIndicators(symbol, closes, highs, lows) {
                try {
                    console.log(`Analyzing indicators for ${symbol}...`);
                    const adx = ADX.calculate({ period: adxPeriod, high: highs, low: lows, close: closes });
                    const adxValue = adx[adx.length - 1].adx;

                    const rsi = RSI.calculate({ period: rsiPeriod, values: closes });
                    const rsiValue = rsi[rsi.length - 1];

                    const crsi = RSI.calculate({ period: crsiPeriod, values: closes });
                    const crsiValue = crsi[crsi.length - 1];

                    return determineSignal(adxValue, rsiValue, crsiValue);
                } catch (error) {
                    console.error(`Error checking indicators for ${symbol}: ${error.message}`);
                    return null;
                }
            }

            websocket.onmessage = function (event) {
                const data = JSON.parse(event.data);
                if (data.msg_type === "ohlc") {
                    const ohlc = data.ohlc;
                    const symbol = data.echo_req.ticks_history;

                    let candleColor;
                    if (parseFloat(ohlc.close) > parseFloat(ohlc.open)) {
                        candleColor = "green";
                    } else if (parseFloat(ohlc.close) < parseFloat(ohlc.open)) {
                        candleColor = "red";
                    } else {
                        candleColor = "doji";
                    }

                    candlesHistory[symbol].unshift({ color: candleColor, open: ohlc.open, close: ohlc.close, high: ohlc.high, low: ohlc.low });
                    if (candlesHistory[symbol].length > 6) candlesHistory[symbol].pop();

                    if (checkZebraPattern(candlesHistory[symbol])) {
                        console.log(`Zebra pattern detected for ${symbol}. Checking indicators...`);

                        const closes = candlesHistory[symbol].map(candle => parseFloat(candle.close));
                        const highs = candlesHistory[symbol].map(candle => parseFloat(candle.high));
                        const lows = candlesHistory[symbol].map(candle => parseFloat(candle.low));

                        const signal = checkIndicators(symbol, closes, highs, lows);
                        if (signal) {
                            signals[symbol] = { signal, timestamp: Date.now() };
                            console.log(`Signal for ${symbol}: ${signal}`);
                            ws.send(JSON.stringify({ type: 'update', message: `Signal for ${symbol}: ${signal}` }));
                        }
                    }
                }
            };

            websocket.onerror = function (error) {
                console.error(`WebSocket error: ${error.message}`);
            };

            websocket.onclose = function () {
                console.log("WebSocket connection closed. Reconnecting...");
                setTimeout(() => {
                    if (botRunning) {
                        startBot();
                    }
                }, 5000);
            };
        }
    }

    function stopBot() {
        if (botRunning) {
            botRunning = false;
            if (websocket) {
                websocket.close();
                websocket = null;
            }
        }
    }
});

server.listen(3000, () => {
    console.log("WebSocket server running on port 3000");
});
