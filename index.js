const fs = require('fs');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const readline = require('readline');

const COLORS = {
    RESET: "\x1b[0m",
    BOLD_YELLOW: "\x1b[1;33m",
    BOLD_CYAN: "\x1b[1;36m",
    GREEN: "\x1b[32m",
    RED: "\x1b[31m",
    WHITE: "\x1b[37m"
};

function alignTextCenter(text, width) {
    const pad = Math.floor((width - text.length) / 2);
    return ' '.repeat(pad) + text + ' '.repeat(pad);
}

const consoleWidth = process.stdout.columns;
console.log("");
console.log(`${COLORS.BOLD_YELLOW}${alignTextCenter("============================================", consoleWidth)}${COLORS.RESET}`);
console.log(`${COLORS.BOLD_YELLOW}${alignTextCenter("Kaisar ZeroNode", consoleWidth)}${COLORS.RESET}`);
console.log(`${COLORS.BOLD_YELLOW}${alignTextCenter("github.com/recitativonika", consoleWidth)}${COLORS.RESET}`);
console.log(`${COLORS.BOLD_YELLOW}${alignTextCenter("============================================", consoleWidth)}${COLORS.RESET}`);
console.log("");

function fetchConfigData() {
    const data = fs.readFileSync('data.txt', 'utf8');
    return data.split('\n').filter(line => line.trim() !== '').map(line => {
        const [email, token, extensionId, proxy] = line.split(',');
        return { email, token, extensionId, proxy };
    });
}

function generateUniqueApiClient(proxy, token, useProxy) {
    const agent = useProxy ? new HttpsProxyAgent(proxy) : undefined;
    return axios.create({
        baseURL: 'https://zero-api.kaisar.io/',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        httpsAgent: agent,
    });
}

async function obtainMissionTasks(email, proxy, token, useProxy, accountNumber) {
    const apiClient = generateUniqueApiClient(proxy, token, useProxy);

    try {
        const response = await apiClient.get('mission/tasks');
        const tasks = response.data.data;
        const activeTaskIds = tasks
            .filter(task => task.status === 1)
            .map(task => task._id);

        if (activeTaskIds.length > 0) {
            console.log(`[${COLORS.BOLD_CYAN}${accountNumber}${COLORS.RESET}] Active tasks found with IDs: ${activeTaskIds}`);
        }

        return activeTaskIds;
    } catch (error) {
        console.error(`[${COLORS.BOLD_CYAN}${accountNumber}${COLORS.RESET}] Unable to retrieve mission tasks for ${COLORS.BOLD_CYAN}${email}${COLORS.RESET}`);
        return null;
    }
}

async function claimMissionRewards(email, proxy, token, taskIds, useProxy, accountNumber) {
    const apiClient = generateUniqueApiClient(proxy, token, useProxy);

    for (let taskId of taskIds) {
        try {
            const response = await apiClient.post(`mission/tasks/${taskId}/claim`, {});
            const task = response.data.data;
            console.log(`[${COLORS.BOLD_CYAN}${accountNumber}${COLORS.RESET}] Claimed rewards from task ID: ${taskId}`);
        } catch (error) {
            console.error(`[${COLORS.BOLD_CYAN}${accountNumber}${COLORS.RESET}] Failed to claim task with ID: ${taskId} for ${COLORS.BOLD_CYAN}${email}${COLORS.RESET}`);
        }
    }
}

async function performDailyLogin(email, proxy, token, useProxy, accountNumber) {
    const apiClient = generateUniqueApiClient(proxy, token, useProxy);

    try {
        const response = await apiClient.post('checkin/check', {});
        const checkin = response.data.data;
        if (checkin) {
            console.log(`[${COLORS.BOLD_CYAN}${accountNumber}${COLORS.RESET}] Successful daily login at: ${checkin.time} for ${COLORS.BOLD_CYAN}${email}${COLORS.RESET}`);
        }
    } catch (error) {
        console.error(`[${COLORS.BOLD_CYAN}${accountNumber}${COLORS.RESET}] Daily login for ${COLORS.BOLD_CYAN}${email}${COLORS.RESET} failed: Already logged in today.`);
    }
}

async function verifyAndClaimTasks(email, proxy, token, useProxy, accountNumber) {
    const taskIds = await obtainMissionTasks(email, proxy, token, useProxy, accountNumber);
    if (taskIds && taskIds.length > 0) {
        await claimMissionRewards(email, proxy, token, taskIds, useProxy, accountNumber);
    } else {
        console.log(`[${COLORS.BOLD_CYAN}${accountNumber}${COLORS.RESET}] No tasks available to claim for ${COLORS.BOLD_CYAN}${email}${COLORS.RESET}`);
    }
}
async function executePingAndUpdate(accountNumber, email, token, proxy, useProxy) {
    const apiClient = generateUniqueApiClient(proxy, token, useProxy);

    try {
        if (useProxy) {
            console.log(`[${COLORS.BOLD_CYAN}${accountNumber}${COLORS.RESET}] ${COLORS.WHITE}Attempting to ping ${COLORS.BOLD_CYAN}${email}${COLORS.WHITE} using proxy ${COLORS.BOLD_YELLOW}${proxy}${COLORS.ORANGE}`);
        } else {
            console.log(`[${COLORS.BOLD_CYAN}${accountNumber}${COLORS.RESET}] ${COLORS.WHITE}Attempting to ping ${COLORS.BOLD_CYAN}${email}${COLORS.WHITE} without proxy`);
        }
        const response = await apiClient.post('/extension/ping', {
            extension: token
        });

        console.log(`[${COLORS.BOLD_CYAN}${accountNumber}${COLORS.RESET}] ${COLORS.GREEN}Ping for ${COLORS.BOLD_CYAN}${email}${COLORS.RESET} ${COLORS.GREEN}was successful${COLORS.RESET}`);
        await obtainMiningData(accountNumber, apiClient, email, useProxy);
    } catch (error) {
        const errorMessage = useProxy ?
            `Ping failed for ${COLORS.BOLD_CYAN}${email}${COLORS.RESET} using proxy ${COLORS.BOLD_YELLOW}${proxy}${COLORS.RESET}` :
            `Ping failed for ${COLORS.BOLD_CYAN}${email}${COLORS.RESET} without proxy`;
        console.error(`[${COLORS.BOLD_CYAN}${accountNumber}${COLORS.RESET}] ${COLORS.RED}${errorMessage}${COLORS.RESET}`);
    }
}

async function obtainMiningData(accountNumber, apiClient, email, useProxy, retries = 3) {
    try {
        const response = await apiClient.get('/mining/current', {
            params: { extension: email }
        });

        if (response.data && response.data.data) {
            const miningData = response.data.data;
            await refreshMiningPoints(accountNumber, email, miningData, apiClient, useProxy);

            if (miningData.ended === 1) {
                console.log(`[${COLORS.BOLD_CYAN}${accountNumber}${COLORS.RESET}] ${COLORS.WHITE}Mining concluded for ${COLORS.BOLD_CYAN}${email}${COLORS.WHITE}. Proceeding to claim mining points.`);
                await finalizeMiningClaim(apiClient, email, useProxy);
            }
        }
    } catch (error) {
        console.error(`[${COLORS.BOLD_CYAN}${accountNumber}${COLORS.RESET}] ${COLORS.RED}Unable to retrieve mining data for ${COLORS.BOLD_CYAN}${email}${COLORS.RESET}: ${error.message}${COLORS.RESET}`);

        if (retries > 0) {
            console.log(`[${COLORS.BOLD_CYAN}${accountNumber}${COLORS.RESET}] ${COLORS.WHITE}Retrying to retrieve mining data for ${COLORS.BOLD_CYAN}${email}${COLORS.WHITE} (${retries} retries left)...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            await obtainMiningData(accountNumber, apiClient, email, useProxy, retries - 1);
        }
    }
}

async function refreshMiningPoints(accountNumber, email, miningData, apiClient, useProxy) {
    const elapsedTimeInHours = (Date.now() - new Date(miningData.start).getTime() - miningData.miss) / 36e5;
    const points = elapsedTimeInHours * miningData.hourly;
    const miningPoint = Math.max(0, points);
    const totalPoints = await fetchAccountBalance(accountNumber, apiClient, email, useProxy);
    console.log(`[${COLORS.BOLD_CYAN}${accountNumber}${COLORS.RESET}] ${COLORS.BOLD_CYAN}${email}${COLORS.RESET} ${COLORS.WHITE}total points: ${COLORS.GREEN}${totalPoints}${COLORS.WHITE}, Mining points: ${COLORS.BOLD_CYAN}${miningPoint}${COLORS.WHITE}, Elapsed time in hours: ${COLORS.BOLD_YELLOW}${elapsedTimeInHours}${COLORS.RESET}`);
}

async function fetchAccountBalance(accountNumber, apiClient, email, useProxy) {
    try {
        console.log(`[${COLORS.BOLD_CYAN}${accountNumber}${COLORS.RESET}] ${COLORS.WHITE}Checking account balance for ${COLORS.BOLD_CYAN}${email}${COLORS.WHITE}...`);
        const response = await apiClient.get('/user/balances');
        const balances = response.data.data[0].balance;
        console.log(`[${COLORS.BOLD_CYAN}${accountNumber}${COLORS.RESET}] ${COLORS.WHITE}Account balance for ${COLORS.BOLD_CYAN}${email}${COLORS.WHITE}: ${COLORS.GREEN}${balances}${COLORS.RESET}`);
        return balances;
    } catch (error) {
        console.error(`[${COLORS.BOLD_CYAN}${accountNumber}${COLORS.RESET}] ${COLORS.RED}Unable to check balance for ${COLORS.BOLD_CYAN}${email}${COLORS.RESET}: ${error.message}${COLORS.RESET}`);
        return null;
    }
}

(async () => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question(`${COLORS.BOLD_YELLOW}Would you like to use a proxy? (y/n):${COLORS.RESET} `, async (useProxyInput) => {
        const useProxy = useProxyInput.trim().toLowerCase() === 'y';
        rl.close();

        const config = fetchConfigData();
        if (config.length === 0) {
            console.error("No configuration found in data.txt. Exiting...");
            return;
        }

        const lastExecution = {};

        for (let i = 0; i < config.length; i++) {
            const { email, token, extensionId, proxy } = config[i];
            processUniqueAccount(i + 1, email, token, extensionId, proxy, useProxy, lastExecution);
        }

        async function processUniqueAccount(accountNumber, email, token, extensionId, proxy, useProxy, lastExecution) {
            while (true) {
                const now = Date.now();

                if (!lastExecution[token] || now - lastExecution[token] >= 24 * 60 * 60 * 1000) {
                    await performDailyLogin(email, proxy, token, useProxy, accountNumber);
                    await verifyAndClaimTasks(email, proxy, token, useProxy, accountNumber);
                    lastExecution[token] = now;
                }

                await executePingAndUpdate(accountNumber, email, token, proxy, useProxy);

                console.log(`[${COLORS.BOLD_CYAN}${accountNumber}${COLORS.RESET}] ${COLORS.WHITE}Pinging again in 1 minute for ${COLORS.BOLD_CYAN}${email}${COLORS.WHITE}...${COLORS.RESET}`);
                await new Promise(resolve => setTimeout(resolve, 60000));
            }
        }
    });
})();
