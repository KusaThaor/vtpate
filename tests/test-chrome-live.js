const { spawn } = require('child_process');
const http = require('http');

async function testWithCDP() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const extPath = 'D:\\vtpate\\VTPATE-extension-1.0.3';
  const userDataDir = 'D:\\vtpate\\.test_chrome_cdp';

  const chromeProc = spawn(chromePath, [
    `--load-extension=${extPath}`,
    `--disable-extensions-except=${extPath}`,
    '--remote-debugging-port=9222',
    `--user-data-dir=${userDataDir}`,
    '--headless=new'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  function request(method, path) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: 9222,
        path: path,
        method: method
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch(e) { resolve(data); }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  try {
    const list = await request('GET', '/json/list');
    const vtpateTarget = list.find(t => t.url && t.url.includes('background.js'));
    const match = vtpateTarget.url.match(/chrome-extension:\/\/([a-z0-9]+)\//);
    const extId = match[1];

    const managerUrl = `chrome-extension://${extId}/manager.html`;
    const target = await request('PUT', `/json/new?${managerUrl}`);
    const ws = new WebSocket(target.webSocketDebuggerUrl);

    let runtimeException = null;
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.exceptionThrown') {
        runtimeException = msg.params.exceptionDetails;
        console.error('>>> RUNTIME EXCEPTION IN CHROME:', JSON.stringify(runtimeException));
      } else if (msg.method === 'Console.messageAdded' && msg.params.message.level === 'error') {
        console.error('>>> CONSOLE ERROR IN CHROME:', msg.params.message.text);
      }
    };

    await new Promise(resolve => ws.onopen = resolve);
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
    ws.send(JSON.stringify({ id: 2, method: 'Log.enable' }));
    ws.send(JSON.stringify({ id: 3, method: 'Page.enable' }));

    // Navigate explicitly to ensure page loads completely
    ws.send(JSON.stringify({ id: 4, method: 'Page.navigate', params: { url: managerUrl } }));

    // Wait 3 seconds
    await new Promise(r => setTimeout(r, 3000));

    // Evaluate in manager.html context
    const evalPromise = new Promise((resolve) => {
      const handler = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id === 10) {
          ws.removeEventListener('message', handler);
          resolve(msg.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({
        id: 10,
        method: 'Runtime.evaluate',
        params: {
          expression: 'JSON.stringify({ title: document.title, tabCount: document.querySelectorAll("[data-manager-tab]").length, cleanerTab: Boolean(document.getElementById("tab-cleaner")), cleanerPanel: Boolean(document.getElementById("panel-cleaner")), statusText: document.getElementById("serviceWorkerStatus")?.textContent?.trim() })'
        }
      }));
    });

    const evalResult = await evalPromise;
    console.log('Eval in Real Chrome manager.html:', evalResult);

    if (runtimeException) {
      console.error('FAILED: Exception occurred in Chrome!');
    } else {
      console.log('SUCCESS: ZERO EXCEPTIONS IN REAL CHROME!');
    }

    ws.close();
  } catch(err) {
    console.error('Error during test:', err);
  } finally {
    chromeProc.kill();
  }
}

testWithCDP().then(() => {
  console.log('Done.');
  process.exit(0);
});
