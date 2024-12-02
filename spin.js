const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');
const readline = require('readline');

const yellow = '\x1b[33m';
const bold = '\x1b[1m';
const reset = '\x1b[0m';

function centerAlignText(text, width) {
    const pad = Math.floor((width - text.length) / 2);
    return ' '.repeat(pad) + text + ' '.repeat(pad);
}

const consoleWidth = process.stdout.columns;
console.log("");
console.log(`${bold}${yellow}${centerAlignText("============================================", consoleWidth)}${reset}`);
console.log(`${bold}${yellow}${centerAlignText("Kaisar zero node bot", consoleWidth)}${reset}`);
console.log(`${bold}${yellow}${centerAlignText("github.com/recitativonika", consoleWidth)}${reset}`);
console.log(`${bold}${yellow}${centerAlignText("============================================", consoleWidth)}${reset}`);
console.log("");

const dataFilePath = path.join(__dirname, 'data.txt');
const accounts = fs.readFileSync(dataFilePath, 'utf-8').trim().split('\n').map(line => line.split(','));

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(query) {
    return new Promise(resolve => rl.question(yellow + query + reset, resolve));
}

async function getTicketBalance(email, token, proxyAgent) {
    try {
        const response = await axios.get('https://zero-api.kaisar.io/user/balances?symbol=ticket', {
            headers: {
                'accept': '*/*',
                'accept-encoding': 'gzip, deflate, br, zstd',
                'accept-language': 'en-US,en;q=0.9,id;q=0.8',
                'authorization': `Bearer ${token}`
            },
            httpsAgent: proxyAgent
        });

        const ticketData = response.data.data.find(item => item.currency === 'ticket');
        return parseInt(ticketData.balance, 10);
    } catch (error) {
        if (error.response && error.response.status === 407) {
            console.error(`Error fetching ticket balance for ${email}: Request failed with status code 407. Not authenticated or invalid authentication credentials. Make sure to update your proxy address, proxy username, and port.`);
        } else {
            console.error(`Error fetching ticket balance for ${email}:`, error.message);
        }
        return 0;
    }
}

async function spinTicket(email, token, proxyAgent) {
    try {
        const response = await axios.post('https://zero-api.kaisar.io/lucky/spin', {}, {
            headers: {
                'accept': '*/*',
                'accept-encoding': 'gzip, deflate, br, zstd',
                'accept-language': 'en-US,en;q=0.9,id;q=0.8',
                'authorization': `Bearer ${token}`
            },
            httpsAgent: proxyAgent
        });

        const prize = response.data.data.prize;
        console.log(`Spin result for ${email} prize: { symbol: '${prize.symbol}', amount: ${prize.amount} }`);
    } catch (error) {
        if (error.response && error.response.status === 407) {
            console.error(`Error spinning ticket for ${email}: Request failed with status code 407. Not authenticated or invalid authentication credentials. Make sure to update your proxy address, proxy username, and port.`);
        } else {
            console.error(`Error spinning ticket for ${email}:`, error.message);
        }
    }
}

async function automateSpinning(email, token, proxyAgent) {
    let ticketBalance = await getTicketBalance(email, token, proxyAgent);

    while (ticketBalance > 0) {
        await spinTicket(email, token, proxyAgent);
        await new Promise(resolve => setTimeout(resolve, 5000));
        ticketBalance = await getTicketBalance(email, token, proxyAgent);
    }

    console.log(`No more tickets left for ${email}.`);
}

async function main() {
    const useProxy = await askQuestion('Do you want to run with proxy? (y/n): ');
    const autoRestart = await askQuestion('Do you want to auto-restart the script? (y/n): ');
    let interval = null;

    if (autoRestart.toLowerCase() === 'y') {
        const hours = await askQuestion('Enter the number of hours for auto-restart: ');
        interval = parseFloat(hours) * 3600000;
    }

    for (const [email, token, extensionId, proxyString] of accounts) {
        let proxyAgent = null;
        if (useProxy.toLowerCase() === 'y') {
            let proxyUrl = proxyString;
            if (!proxyUrl.startsWith('http://') && !proxyUrl.startsWith('https://')) {
                proxyUrl = `http://${proxyUrl}`;
            }
            proxyAgent = new HttpsProxyAgent(proxyUrl);
        }

        await automateSpinning(email, token, proxyAgent);
    }

    if (interval) {
        console.log(`Restarting process in ${interval / 3600000} hour(s)...`);
        setInterval(() => {
            for (const [email, token, extensionId, proxyString] of accounts) {
                let proxyAgent = null;
                if (useProxy.toLowerCase() === 'y') {
                    let proxyUrl = proxyString;
                    if (!proxyUrl.startsWith('http://') && !proxyUrl.startsWith('https://')) {
                        proxyUrl = `http://${proxyUrl}`;
                    }
                    console.log(`Using proxy: ${proxyUrl}`);
                    proxyAgent = new HttpsProxyAgent(proxyUrl);
                }
                console.log(`Restarting script for ${email}...`);
                automateSpinning(email, token, proxyAgent);
            }
        }, interval);
    }

    rl.close();
}

main();

main();
