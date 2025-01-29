import axios from 'axios';
import blessed from 'blessed';
import fs from 'fs';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TOKEN_URL = "https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token";
const DEVICE_AUTH_URL = "https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/deviceAuthorization";
const CLIENT_CREDENTIALS = "Basic OThmN2U0MmMyZTNhNGY4NmE3NGViNDNmYmI0MWVkMzk6MGEyNDQ5YTItMDAxYS00NTFlLWFmZWMtM2U4MTI5MDFjNGQ3";

const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));

const screen = blessed.screen({
  smartCSR: true,
  title: 'Fortnite Tool'
});

const logBox = blessed.log({
  top: '0',
  left: '0',
  width: '100%',
  height: '95%',
  border: {
    type: 'line'
  },
  style: {
    fg: 'blue',
    border: {
      fg: 'blue'
    }
  },
  scrollable: true,
  alwaysScroll: true,
  keys: true,
  vi: true
});

const inputBox = blessed.textbox({
  bottom: 0,
  left: 0,
  width: '100%',
  height: '5%',
  inputOnFocus: true,
  border: {
    type: 'line'
  },
  style: {
    fg: 'black',
    border: {
      fg: 'blue'
    }
  }
});

screen.append(logBox);
screen.append(inputBox);

const displayLog = (text) => {
  logBox.log(text);
  screen.render();
};

const waitForAuthorization = async (deviceCode, startTime, accessToken) => {
  displayLog(chalk.yellow('│Waiting for confirm button to be pressed...'));

  let authorizationReceived = false;
  while (!authorizationReceived && (Date.now() - startTime < 2 * 60 * 1000)) {
    try {
      const tokenExchangeResponse = await axios.post(TOKEN_URL, `grant_type=device_code&device_code=${deviceCode}&token_type=eg1`, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": CLIENT_CREDENTIALS
        }
      });

      if (tokenExchangeResponse.status === 200) {
        const loggedInData = tokenExchangeResponse.data;

        if (loggedInData.access_token) {
          const userInfoResponse = await axios.get(`https://account-public-service-prod.ol.epicgames.com/account/api/public/account/${loggedInData.account_id}`, {
            headers: { "Authorization": `Bearer ${loggedInData.access_token}` }
          });

          const userInfo = userInfoResponse.data;

          const exchangeResponse = await axios.get(`https://account-public-service-prod.ol.epicgames.com/account/api/oauth/exchange`, {
            headers: {
              "Authorization": `Bearer ${loggedInData.access_token}`
            }
          });

          const code = exchangeResponse.data.code;
          const loginLink = `https://www.epicgames.com/id/exchange?exchangeCode=${code}`;

          displayLog(chalk.cyan(`
          Display Name: ${userInfo.displayName}
          Email: ${userInfo.email}
          Country: ${userInfo.country}
          Login Link: ${loginLink}
          `));

          if (config.autoChangeName) {
            const randomSuffix = Math.floor(1000 + Math.random() * 9000);
            const newDisplayName = `${config.newName}${randomSuffix}`;

            try {
              const changeNameResponse = await axios.put(`https://account-public-service-prod.ol.epicgames.com/account/api/public/account/${loggedInData.account_id}`,
                { displayName: newDisplayName },
                { headers: { "Authorization": `Bearer ${loggedInData.access_token}` } });

              if (changeNameResponse.status === 200) {
                displayLog(chalk.green(`Display name changed to: ${newDisplayName}`));
              } else {
                displayLog(chalk.red(`Failed to change display name.`));
              }
            } catch (error) {
              displayLog(chalk.red(`Error changing display name: ${error.message}`));
            }
          }

          authorizationReceived = true;
        }
      }
    } catch (error) {
      if (error.response && error.response.status !== 400) {
        displayLog(chalk.red(`Polling error: ${error.message}`));
      }
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  if (!authorizationReceived) {
    displayLog(chalk.yellow("Authorization timeout"));
  }
};

const generateLinkAndPoll = async () => {
  try {
    const tokenResponse = await axios.post(TOKEN_URL, "grant_type=client_credentials", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": CLIENT_CREDENTIALS
      }
    });

    const accessToken = tokenResponse.data.access_token;

    const deviceAuthResponse = await axios.post(DEVICE_AUTH_URL, "prompt=login", {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });

    const deviceCode = deviceAuthResponse.data.device_code;
    const verificationUrl = `https://www.epicgames.com/id/activate?userCode=${deviceAuthResponse.data.user_code}`;

    displayLog(chalk.blue(`Link: ${verificationUrl}`));

    const startTime = Date.now();
    await waitForAuthorization(deviceCode, startTime, accessToken);

    await generateLinkAndPoll();
  } catch (error) {
    displayLog(chalk.red(`Error: ${error.message}`));
  }
};

const start = async () => {
  screen.render();

  inputBox.on('submit', () => {
    logBox.setContent('');
    screen.render();
  });

  await generateLinkAndPoll();
};

start();
