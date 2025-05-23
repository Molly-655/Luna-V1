const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const figlet = require('figlet'); 
const chalk = require('chalk'); 
const axios = require('axios');

let logInfo, logSuccess, logError;
try {
    const logger = require('../../../utils/logger');
    logInfo = logger.logInfo;
    logSuccess = logger.logSuccess;
    logError = logger.logError;
} catch (error) { 
    logInfo = (msg) => console.log(chalk.blueBright(`[INFO] ${msg}`)); 
    logSuccess = (msg) => console.log(chalk.greenBright.bold(`[SUCCESS] ${msg}`));
    logError = (msg) => console.log(chalk.redBright.bold(`[ERROR] ${msg}`));
}

let config;
try {
    config = require('../../../config.json');
} catch (error) {
    try {
        config = require('../../config.json');
    } catch (error) {
        config = {
            whatsappAccount: {
                phoneNumber: ''
            },
            botSettings: {
                timeZone: 'UTC',
                language: 'en'
            }
        };
        logInfo('No config.json found, will prompt for phone number and use default timezone');
    }
}

const getTimestamp = () => {
    const timeZone = config.botSettings?.timeZone || 'UTC';
    const now = new Date();

    try {
        const options = { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit',
            hour12: false,
            timeZone 
        };
        const timeString = now.toLocaleTimeString('en-US', options);
        return chalk.gray(`[${timeString}]`);
    } catch (error) {
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        logError(`Invalid timezone: ${timeZone}, using local time`);
        return chalk.gray(`[${hours}:${minutes}:${seconds}]`);
    }
};

const getFormattedDate = () => {
    const timeZone = config.botSettings?.timeZone || 'UTC';
    const now = new Date();

    try {
        const options = { 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit',
            timeZone 
        };
        const dateString = now.toLocaleDateString('en-CA', options);
        return chalk.gray(`[${dateString}]`);
    } catch (error) {
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        logError(`Invalid timezone: ${timeZone}, using local time`);
        return chalk.gray(`[${year}-${month}-${day}]`);
    }
};

const lunaAsciiArt = figlet.textSync('LUNA V 1', {
    font: 'Standard',
    horizontalLayout: 'default',
    verticalLayout: 'default'
});

function getVersion() {
    try {
        const packageJsonPath = path.resolve(process.cwd(), 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        return packageJson.version || '1.0.0';
    } catch (error) {
        logInfo('Warning: Could not check if package.json exists');
        return '1.0.0';
    }
}

const displayLunaBotTitle = () => {
    console.clear();

    console.log(chalk.bold.magentaBright(lunaAsciiArt));

    const version = getVersion();
    const versionText = `         Luna Bot version ${version}`;

    console.log(chalk.cyanBright(versionText));
    console.log(chalk.gray("      Created by Mr perfect with 💗"));

    const line = "─".repeat(42);
    console.log(chalk.yellowBright(line));

    return line;
};

const ensureAuthDirectory = () => {
    const authDir = config.whatsappAccount?.sessionPath || './auth';
    const sessionDir = path.join(authDir, 'session');

    if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
    }
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
    }

    return sessionDir;
};

const question = (text) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => {
        rl.question(text, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
};

const checkGitHubAuthorization = async (phoneNumber) => {
    try {
        const response = await axios.get('https://raw.githubusercontent.com/Godperfect/Bot/refs/heads/main/auth.json');
        const authData = response.data;
        if (Array.isArray(authData) && authData.includes(phoneNumber)) {
            // Print authorized user message AFTER the line in authenticateSession
            return true;
        } else {
            logError(chalk.redBright.bold('Unauthorized access attempt!'));
            return false;
        }
    } catch (error) {
        logError(chalk.redBright.bold(`GitHub authorization check failed: ${error.message}`));
        return false;
    }
};

const getAuthState = async () => {
    try {
        const line = displayLunaBotTitle();
        const sessionDir = ensureAuthDirectory();
        const authFilePath = config.whatsappAccount?.authFilePath || path.join(sessionDir);
        const { state, saveCreds } = await useMultiFileAuthState(authFilePath);
        return { state, saveCreds, line };
    } catch (err) {
        logError(chalk.redBright.bold(`Error getting auth state: ${err.message}`));
        throw new Error(`Authentication state error: ${err.message}`);
    }
};

const authenticateSession = async (ptz) => {
    try {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const line = ptz.line;

        let phoneNumber = config.whatsappAccount?.phoneNumber;

        if (!phoneNumber) {
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellowBright.bold('Enter your phone number:')}`);
            phoneNumber = await question('> ');
        }

        phoneNumber = phoneNumber.replace(/[^0-9]/g, '');

        const isAuthorized = await checkGitHubAuthorization(phoneNumber);
        if (!isAuthorized) {
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.redBright.bold('Need access to the bot? Just reach out to the developer at +977 9863479066.')}`);
            process.exit(1);
        }

        // Print line before status messages for clean separation
        if (line) console.log(chalk.yellowBright(line));

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.greenBright.bold('AUTHORIZED USER')}`);
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellowBright.bold(`LOGGING IN: ${phoneNumber}`)}`);
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellowBright.bold('CHECKING SESSIONS')}`);

        const qrTimeout = config.whatsappAccount?.qrTimeout || 60;

        if (!ptz.authState?.creds?.registered) {
            try {
                let code = await ptz.requestPairingCode(phoneNumber);
                code = code?.match(/.{1,3}/g)?.join("-") || code;

                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellowBright.bold(`PAIRING CODE: ${code}`)}`);
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.cyanBright('Please enter this code in your WhatsApp mobile app')}`);
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellowBright(`QR code will expire in ${qrTimeout} seconds`)}`);

                ptz.ev.on('connection.update', (update) => {
                    const { connection } = update;
                    if (connection === 'open') {
                        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.greenBright.bold('BOT IS SUCCESSFULLY CONNECTED')}`);
                        if (line) console.log(chalk.yellowBright(line));
                    }
                });

                await new Promise(resolve => setTimeout(resolve, 5000));
            } catch (err) {
                logError(chalk.redBright.bold(`Failed to get pairing code: ${err.message}`));
                throw err;
            }
        } else {
            ptz.ev.on('connection.update', (update) => {
                const { connection } = update;
                if (connection === 'open') {
                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.greenBright.bold('BOT IS SUCCESSFULLY CONNECTED')}`);
                    if (line) console.log(chalk.yellowBright(line));
                }
            });
        }
    } catch (err) {
        logError(chalk.redBright.bold(`Authentication error: ${err.message}`));
        throw err;
    }
};

module.exports = {
    getAuthState,
    authenticateSession,
    displayLunaBotTitle,
    getTimestamp,
    getFormattedDate
};
