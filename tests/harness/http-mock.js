// tests/harness/http-mock.js
// Fetch and Network Interceptor for VTPATE E2E Testing

class MockResponse {
  constructor(body = '', init = {}) {
    this.status = init.status !== undefined ? init.status : 200;
    this.statusText = init.statusText || (this.status === 200 ? 'OK' : 'Error');
    this.ok = this.status >= 200 && this.status < 300;
    this.headers = new Map();

    if (init.headers) {
      if (init.headers instanceof Map) {
        for (const [k, v] of init.headers) {
          this.headers.set(k.toLowerCase(), String(v));
        }
      } else if (typeof init.headers === 'object') {
        for (const [k, v] of Object.entries(init.headers)) {
          this.headers.set(k.toLowerCase(), String(v));
        }
      }
    }

    this._rawBody = body;
  }

  get(headerName) {
    return this.headers.get(headerName.toLowerCase()) || null;
  }

  async text() {
    if (typeof this._rawBody === 'string') return this._rawBody;
    if (Buffer.isBuffer(this._rawBody)) return this._rawBody.toString('utf-8');
    if (typeof this._rawBody === 'object') return JSON.stringify(this._rawBody);
    return String(this._rawBody);
  }

  async json() {
    if (typeof this._rawBody === 'object' && !Buffer.isBuffer(this._rawBody)) {
      return this._rawBody;
    }
    const t = await this.text();
    return JSON.parse(t);
  }

  async arrayBuffer() {
    if (Buffer.isBuffer(this._rawBody)) {
      return this._rawBody.buffer.slice(
        this._rawBody.byteOffset,
        this._rawBody.byteOffset + this._rawBody.byteLength
      );
    }
    const str = typeof this._rawBody === 'string' ? this._rawBody : JSON.stringify(this._rawBody);
    const buf = Buffer.from(str, 'utf-8');
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }

  async blob() {
    const ab = await this.arrayBuffer();
    return {
      size: ab.byteLength,
      type: this.headers.get('content-type') || 'application/octet-stream',
      arrayBuffer: async () => ab
    };
  }
}

class HttpMock {
  constructor() {
    this._routes = [];
    this._requests = [];
    this._originalFetch = global.fetch;
  }

  reset() {
    this._routes = [];
    this._requests = [];
  }

  on(matcher, handlerOrResponse) {
    this._routes.push({ matcher, handler: handlerOrResponse });
    return this;
  }

  onGet(matcher, handlerOrResponse) {
    return this.on((url, init) => {
      const method = (init && init.method ? init.method : 'GET').toUpperCase();
      if (method !== 'GET') return false;
      if (typeof matcher === 'string') {
        if (matcher.startsWith('http://') || matcher.startsWith('https://')) {
          return url === matcher || url === matcher + '/';
        }
        return url.includes(matcher);
      }
      if (matcher instanceof RegExp) return matcher.test(url);
      if (typeof matcher === 'function') return matcher(url, init);
      return false;
    }, handlerOrResponse);
  }

  getRequests() {
    return [...this._requests];
  }

  install() {
    const self = this;
    global.fetch = async function mockFetch(resource, init = {}) {
      const url = typeof resource === 'string' ? resource : resource.url;
      const requestRecord = {
        url,
        method: (init.method || 'GET').toUpperCase(),
        headers: init.headers || {},
        credentials: init.credentials || 'same-origin',
        body: init.body || null,
        timestamp: Date.now()
      };
      self._requests.push(requestRecord);

      for (const route of self._routes) {
        let matches = false;
        if (typeof route.matcher === 'string') {
          if (route.matcher.startsWith('http://') || route.matcher.startsWith('https://')) {
            matches = url === route.matcher || url === route.matcher + '/';
          } else {
            matches = url.includes(route.matcher);
          }
        } else if (route.matcher instanceof RegExp) {
          matches = route.matcher.test(url);
        } else if (typeof route.matcher === 'function') {
          matches = route.matcher(url, init);
        }

        if (matches) {
          if (typeof route.handler === 'function') {
            const resp = await route.handler(url, init, requestRecord);
            if (resp instanceof MockResponse) return resp;
            if (resp && typeof resp === 'object' && ('status' in resp || 'body' in resp)) {
              return new MockResponse(resp.body, resp);
            }
            return new MockResponse(resp);
          }
          if (route.handler instanceof MockResponse) {
            return route.handler;
          }
          if (route.handler && typeof route.handler === 'object' && ('status' in route.handler || 'body' in route.handler)) {
            return new MockResponse(route.handler.body, route.handler);
          }
          return new MockResponse(route.handler);
        }
      }

      // Default fallback
      return new MockResponse('Not found in mock', { status: 404, statusText: 'Not Found' });
    };
    return global.fetch;
  }

  uninstall() {
    if (this._originalFetch) {
      global.fetch = this._originalFetch;
    } else {
      delete global.fetch;
    }
  }
}

module.exports = {
  HttpMock,
  MockResponse
};
