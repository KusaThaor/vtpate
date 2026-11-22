// src/storage/library-manager.js
// Temporary EPUB Library Manager for VTPATE Studio
// Cloned and fully compatible with WebToEpub (akiljllkbielkidmammnifcnibaigelm) storage architecture.

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    module.exports.LibraryManager = factory();
  } else {
    root.LibraryManager = factory();
  }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  function getHostRequire() {
    if (typeof require === 'function') {
      return require;
    }
    return null;
  }

  function resolveJSZip() {
    if (typeof JSZip !== 'undefined') return JSZip;
    if (typeof window !== 'undefined' && window.JSZip) return window.JSZip;
    if (typeof globalThis !== 'undefined' && globalThis.JSZip) return globalThis.JSZip;
    if (typeof global !== 'undefined' && global.JSZip) return global.JSZip;

    var req = getHostRequire();
    if (req) {
      try {
        var p = req('path');
        var fullPath = p.resolve(__dirname, '../../libs/jszip.min.js');
        var loaded = req(fullPath);
        if (loaded) return loaded.JSZip || loaded;
      } catch (_) {
        try { return req('jszip'); } catch (__) {}
      }
    }
    return null;
  }

  function getChromeStorage() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return chrome.storage.local;
    }
    return null;
  }

  function blobToDataUrl(blob) {
    return new Promise(async (resolve, reject) => {
      if (!blob) return resolve('');
      if (typeof FileReader !== 'undefined') {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
        return;
      }
      if (typeof Buffer !== 'undefined') {
        if (Buffer.isBuffer(blob)) {
          return resolve('data:application/epub+zip;base64,' + blob.toString('base64'));
        }
        if (typeof blob.arrayBuffer === 'function') {
          const ab = await blob.arrayBuffer();
          const buf = Buffer.from(ab);
          return resolve('data:application/epub+zip;base64,' + buf.toString('base64'));
        }
      }
      resolve('');
    });
  }

  function dataUrlToBlob(dataUrl, defaultType = 'application/epub+zip') {
    if (!dataUrl) return new Blob([], { type: defaultType });
    if (typeof fetch === 'function') {
      return fetch(dataUrl).then(res => res.blob());
    }
    const parts = dataUrl.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : defaultType;
    const b64 = parts[1] || '';
    const binary = atob(b64);
    const len = binary.length;
    const u8 = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      u8[i] = binary.charCodeAt(i);
    }
    return new Blob([u8], { type: mime });
  }

  class LibraryManager {
    constructor(options = {}) {
      this.storage = options.storage || getChromeStorage();
      this.fallbackMemory = new Map();
    }

    async _storageGet(keys) {
      if (this.storage && typeof this.storage.get === 'function') {
        return new Promise((resolve) => {
          this.storage.get(keys, (res) => resolve(res || {}));
        });
      }
      const res = {};
      const keyList = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(this.fallbackMemory));
      for (const k of keyList) {
        if (this.fallbackMemory.has(k)) res[k] = this.fallbackMemory.get(k);
      }
      return res;
    }

    async _storageSet(items) {
      if (this.storage && typeof this.storage.set === 'function') {
        return new Promise((resolve) => {
          this.storage.set(items, () => resolve());
        });
      }
      for (const [k, v] of Object.entries(items)) {
        this.fallbackMemory.set(k, v);
      }
      return Promise.resolve();
    }

    async _storageRemove(keys) {
      const keyList = Array.isArray(keys) ? keys : [keys];
      if (this.storage && typeof this.storage.remove === 'function') {
        return new Promise((resolve) => {
          this.storage.remove(keyList, () => resolve());
        });
      }
      for (const k of keyList) {
        this.fallbackMemory.delete(k);
      }
      return Promise.resolve();
    }

    async getStorageIds() {
      const data = await this._storageGet('LibArray');
      let arr = data['LibArray'];
      if (!Array.isArray(arr)) {
        arr = [];
      }
      return arr.map(String);
    }

    async setStorageIds(ids) {
      await this._storageSet({ LibArray: ids.map(String) });
    }

    async getAllNovels() {
      const ids = await this.getStorageIds();
      if (ids.length === 0) return [];

      const keysToFetch = [];
      for (const id of ids) {
        keysToFetch.push(
          'LibStoryURL' + id,
          'LibFilename' + id,
          'LibTitle' + id,
          'LibAuthor' + id,
          'LibDescription' + id,
          'LibCover' + id,
          'LibNewChapterCount' + id,
          'LibUpdatedAt' + id
        );
      }

      const store = await this._storageGet(keysToFetch);
      const novels = [];
      for (const id of ids) {
        novels.push({
          id,
          url: store['LibStoryURL' + id] || '',
          filename: store['LibFilename' + id] || '',
          title: store['LibTitle' + id] || 'Chưa có tiêu đề',
          author: store['LibAuthor' + id] || 'Chưa rõ',
          description: store['LibDescription' + id] || '',
          cover: store['LibCover' + id] || null,
          newChapterCount: store['LibNewChapterCount' + id] || '0',
          updatedAt: store['LibUpdatedAt' + id] || ''
        });
      }
      return novels;
    }

    async findNovelByUrl(url) {
      if (!url) return null;
      const ids = await this.getStorageIds();
      if (ids.length === 0) return null;

      const urlKeys = ids.map(id => 'LibStoryURL' + id);
      const store = await this._storageGet(urlKeys);

      const normalizedTarget = url.trim().replace(/\/+$/, '').toLowerCase();
      for (const id of ids) {
        const novelUrl = store['LibStoryURL' + id];
        if (novelUrl && novelUrl.trim().replace(/\/+$/, '').toLowerCase() === normalizedTarget) {
          return { id, url: novelUrl };
        }
      }
      return null;
    }

    async getNovel(id) {
      const sid = String(id);
      const keys = [
        'LibStoryURL' + sid,
        'LibFilename' + sid,
        'LibTitle' + sid,
        'LibAuthor' + sid,
        'LibDescription' + sid,
        'LibCover' + sid,
        'LibNewChapterCount' + sid,
        'LibUpdatedAt' + sid,
        'LibEpub' + sid
      ];
      const store = await this._storageGet(keys);
      if (!store['LibStoryURL' + sid] && !store['LibFilename' + sid] && !store['LibEpub' + sid]) {
        return null;
      }
      return {
        id: sid,
        url: store['LibStoryURL' + sid] || '',
        filename: store['LibFilename' + sid] || '',
        title: store['LibTitle' + sid] || '',
        author: store['LibAuthor' + sid] || '',
        description: store['LibDescription' + sid] || '',
        cover: store['LibCover' + sid] || null,
        newChapterCount: store['LibNewChapterCount' + sid] || '0',
        updatedAt: store['LibUpdatedAt' + sid] || '',
        epubDataUrl: store['LibEpub' + sid] || ''
      };
    }

    async saveToLibrary(params = {}) {
      const {
        url = '',
        filename = '',
        title = '',
        author = '',
        description = '',
        coverBlob = null,
        coverDataUrl = null,
        epubBlob = null,
        isMerge = true,
        newChaptersCount = 0
      } = params;

      let targetId = params.id ? String(params.id) : null;
      let ids = await this.getStorageIds();

      if (!targetId && url) {
        const found = await this.findNovelByUrl(url);
        if (found) targetId = found.id;
      }

      let isNew = false;
      if (!targetId) {
        isNew = true;
        let highest = -1;
        for (const item of ids) {
          const num = parseInt(item, 10);
          if (!isNaN(num) && num > highest) highest = num;
        }
        targetId = String(highest + 1);
        ids.push(targetId);
        await this.setStorageIds(ids);
      }

      let finalEpubBlob = epubBlob;

      // Handle merge with existing EPUB in library if present
      if (!isNew && isMerge && epubBlob) {
        const existingData = await this._storageGet('LibEpub' + targetId);
        const prevBase64 = existingData['LibEpub' + targetId];
        if (prevBase64) {
          try {
            finalEpubBlob = await this.mergeEpub(prevBase64, epubBlob);
          } catch (mergeErr) {
            // If merge fails, fallback to using new blob
            finalEpubBlob = epubBlob;
          }
        }
      }

      let finalEpubDataUrl = '';
      if (finalEpubBlob) {
        finalEpubDataUrl = await blobToDataUrl(finalEpubBlob);
      }

      let finalCoverDataUrl = coverDataUrl;
      if (!finalCoverDataUrl && coverBlob) {
        finalCoverDataUrl = await blobToDataUrl(coverBlob);
      }

      const updates = {
        ['LibStoryURL' + targetId]: url,
        ['LibFilename' + targetId]: filename || (title ? `${title.replace(/[\\/:*?"<>|]/g, '_')}.epub` : 'Truyen.epub'),
        ['LibTitle' + targetId]: title,
        ['LibAuthor' + targetId]: author,
        ['LibDescription' + targetId]: description,
        ['LibUpdatedAt' + targetId]: new Date().toISOString(),
        ['LibNewChapterCount' + targetId]: String(newChaptersCount || '0')
      };

      if (finalEpubDataUrl) {
        updates['LibEpub' + targetId] = finalEpubDataUrl;
      }
      if (finalCoverDataUrl) {
        updates['LibCover' + targetId] = finalCoverDataUrl;
      }

      await this._storageSet(updates);
      return { id: targetId, isNew };
    }

    async mergeEpub(previousBase64, newEpubBlob) {
      const JSZipLib = resolveJSZip();
      if (!JSZipLib) throw new Error('JSZip is not available for merging EPUBs.');

      // Extract raw base64 data
      const cleanPrevBase64 = previousBase64.replace(/^data:.*?;base64,/, '');
      const prevZip = await JSZipLib.loadAsync(cleanPrevBase64, { base64: true });
      const newZip = await JSZipLib.loadAsync(newEpubBlob);

      // Inspect previous EPUB structure
      let prevContentOpf = null;
      let prevContentOpfPath = 'OEBPS/content.opf';
      if (prevZip.file('OEBPS/content.opf')) {
        prevContentOpf = await prevZip.file('OEBPS/content.opf').async('string');
        prevContentOpfPath = 'OEBPS/content.opf';
      } else if (prevZip.file('content.opf')) {
        prevContentOpf = await prevZip.file('content.opf').async('string');
        prevContentOpfPath = 'content.opf';
      }

      let prevTocNcx = null;
      let prevTocNcxPath = 'OEBPS/toc.ncx';
      if (prevZip.file('OEBPS/toc.ncx')) {
        prevTocNcx = await prevZip.file('OEBPS/toc.ncx').async('string');
        prevTocNcxPath = 'OEBPS/toc.ncx';
      } else if (prevZip.file('toc.ncx')) {
        prevTocNcx = await prevZip.file('toc.ncx').async('string');
        prevTocNcxPath = 'toc.ncx';
      }

      let prevNavXhtml = null;
      let prevNavXhtmlPath = 'OEBPS/nav.xhtml';
      if (prevZip.file('OEBPS/nav.xhtml')) {
        prevNavXhtml = await prevZip.file('OEBPS/nav.xhtml').async('string');
        prevNavXhtmlPath = 'OEBPS/nav.xhtml';
      } else if (prevZip.file('OEBPS/toc.xhtml')) {
        prevNavXhtml = await prevZip.file('OEBPS/toc.xhtml').async('string');
        prevNavXhtmlPath = 'OEBPS/toc.xhtml';
      }

      if (!prevContentOpf) {
        // Cannot parse previous OPF, return new EPUB blob as fallback
        return newEpubBlob;
      }

      function isChapterFile(filename) {
        if (!filename.endsWith('.xhtml') && !filename.endsWith('.html')) return false;
        if (filename.includes('nav.xhtml') || filename.includes('toc.xhtml') || filename.includes('intro.xhtml')) return false;
        return /(?:chapters?|ch|text)[/\\_]\d+/i.test(filename) ||
               /(?:ch|chapter)[-_]?\d+\.xhtml$/i.test(filename) ||
               /\d{4}.*\.xhtml$/i.test(filename);
      }

      // Count existing chapters in previous zip
      const prevFiles = Object.keys(prevZip.files);
      const prevChapterFiles = prevFiles.filter(isChapterFile);
      let chapterOffset = prevChapterFiles.length;

      // Find new chapters from newZip
      const newFiles = Object.keys(newZip.files);
      const newChapterFiles = newFiles.filter(isChapterFile);
      newChapterFiles.sort();

      const usesVtpatePath = prevFiles.some(f => f.startsWith('OEBPS/chapters/') || f.startsWith('chapters/'));

      let manifestItems = '';
      let spineItems = '';
      let navPoints = '';
      let navLiItems = '';

      // Determine highest playOrder in previous toc.ncx
      let highestPlayOrder = chapterOffset;
      if (prevTocNcx) {
        const orderMatches = prevTocNcx.match(/playOrder=["'](\d+)["']/g);
        if (orderMatches) {
          for (const m of orderMatches) {
            const num = parseInt(m.replace(/\D/g, ''), 10);
            if (!isNaN(num) && num > highestPlayOrder) highestPlayOrder = num;
          }
        }
      }

      for (let i = 0; i < newChapterFiles.length; i++) {
        const origPath = newChapterFiles[i];
        const chapterNum = chapterOffset + i + 1;
        const newPath = usesVtpatePath
          ? `OEBPS/chapters/ch_${chapterNum}.xhtml`
          : `OEBPS/Text/chapter_${String(chapterNum).padStart(4, '0')}.xhtml`;
        const hrefPath = usesVtpatePath
          ? `chapters/ch_${chapterNum}.xhtml`
          : `Text/chapter_${String(chapterNum).padStart(4, '0')}.xhtml`;

        const content = await newZip.file(origPath).async('string');
        prevZip.file(newPath, content);

        const itemId = `chapter_${chapterNum}`;
        manifestItems += `    <item id="${itemId}" href="${hrefPath}" media-type="application/xhtml+xml"/>\n`;
        spineItems += `    <itemref idref="${itemId}"/>\n`;

        // Extract title from chapter content
        const titleMatch = content.match(/<h[12][^>]*>(.*?)<\/h[12]>/i) || content.match(/<title>(.*?)<\/title>/i);
        const chapterTitle = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : `Chương ${chapterNum}`;

        highestPlayOrder++;
        navPoints += `    <navPoint id="navPoint-${chapterNum}" playOrder="${highestPlayOrder}">\n` +
                     `      <navLabel><text>${chapterTitle}</text></navLabel>\n` +
                     `      <content src="${hrefPath}"/>\n` +
                     `    </navPoint>\n`;

        navLiItems += `      <li><a href="${hrefPath}">${chapterTitle}</a></li>\n`;
      }

      // Copy any new images
      const newImages = newFiles.filter(f => f.startsWith('OEBPS/Images/') || f.startsWith('Images/'));
      for (const imgPath of newImages) {
        if (!prevZip.file(imgPath)) {
          const imgData = await newZip.file(imgPath).async('uint8array');
          prevZip.file(imgPath, imgData);
          const imgFilename = imgPath.split('/').pop();
          const imgId = `img_${imgFilename.replace(/[^a-zA-Z0-9]/g, '_')}`;
          const ext = imgFilename.split('.').pop().toLowerCase();
          const mime = ext === 'png' ? 'image/png' : (ext === 'webp' ? 'image/webp' : 'image/jpeg');
          manifestItems += `    <item id="${imgId}" href="${imgPath.replace(/^OEBPS\//, '')}" media-type="${mime}"/>\n`;
        }
      }

      // Update content.opf
      if (manifestItems) {
        prevContentOpf = prevContentOpf.replace('</manifest>', `${manifestItems}</manifest>`);
        prevContentOpf = prevContentOpf.replace('</spine>', `${spineItems}</spine>`);
        prevZip.file(prevContentOpfPath, prevContentOpf);
      }

      // Update toc.ncx
      if (prevTocNcx && navPoints) {
        prevTocNcx = prevTocNcx.replace('</navMap>', `${navPoints}</navMap>`);
        prevZip.file(prevTocNcxPath, prevTocNcx);
      }

      // Update nav.xhtml if present
      if (prevNavXhtml && navLiItems) {
        if (prevNavXhtml.includes('</ol>')) {
          prevNavXhtml = prevNavXhtml.replace('</ol>', `${navLiItems}</ol>`);
          prevZip.file(prevNavXhtmlPath, prevNavXhtml);
        }
      }

      // Ensure mimetype is first and uncompressed STORE
      return await prevZip.generateAsync({
        type: 'blob',
        mimeType: 'application/epub+zip',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 }
      });
    }

    async deleteNovel(id) {
      const sid = String(id);
      let ids = await this.getStorageIds();
      ids = ids.filter(item => item !== sid);
      await this.setStorageIds(ids);

      const removeKeys = [
        'LibStoryURL' + sid,
        'LibFilename' + sid,
        'LibTitle' + sid,
        'LibAuthor' + sid,
        'LibDescription' + sid,
        'LibCover' + sid,
        'LibNewChapterCount' + sid,
        'LibUpdatedAt' + sid,
        'LibEpub' + sid
      ];
      await this._storageRemove(removeKeys);
    }

    async clearLibrary() {
      const ids = await this.getStorageIds();
      const keys = ['LibArray'];
      for (const id of ids) {
        keys.push(
          'LibStoryURL' + id,
          'LibFilename' + id,
          'LibTitle' + id,
          'LibAuthor' + id,
          'LibDescription' + id,
          'LibCover' + id,
          'LibNewChapterCount' + id,
          'LibUpdatedAt' + id,
          'LibEpub' + id
        );
      }
      await this._storageRemove(keys);
      await this.setStorageIds([]);
    }

    async changeOrder(id, delta) {
      const sid = String(id);
      const ids = await this.getStorageIds();
      const idx = ids.indexOf(sid);
      if (idx === -1) return;

      const targetIdx = idx + delta;
      if (targetIdx < 0 || targetIdx >= ids.length) return;

      const temp = ids[idx];
      ids[idx] = ids[targetIdx];
      ids[targetIdx] = temp;

      await this.setStorageIds(ids);
    }

    async updateMetadata(id, updates = {}) {
      const sid = String(id);
      const payload = {};
      if (updates.title !== undefined) payload['LibTitle' + sid] = updates.title;
      if (updates.author !== undefined) payload['LibAuthor' + sid] = updates.author;
      if (updates.description !== undefined) payload['LibDescription' + sid] = updates.description;
      if (updates.url !== undefined) payload['LibStoryURL' + sid] = updates.url;
      if (updates.filename !== undefined) payload['LibFilename' + sid] = updates.filename;
      if (updates.newChapterCount !== undefined) payload['LibNewChapterCount' + sid] = String(updates.newChapterCount);
      payload['LibUpdatedAt' + sid] = new Date().toISOString();

      await this._storageSet(payload);
    }

    async getBytesInUse() {
      if (this.storage && typeof this.storage.getBytesInUse === 'function') {
        return new Promise((resolve) => {
          this.storage.getBytesInUse(null, (bytes) => {
            resolve(bytes || 0);
          });
        });
      }
      let total = 0;
      for (const [k, v] of this.fallbackMemory.entries()) {
        total += (k.length + (typeof v === 'string' ? v.length : 100));
      }
      return total;
    }

    async exportLibraryJson() {
      const ids = await this.getStorageIds();
      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        ids,
        novels: {}
      };

      for (const id of ids) {
        const novel = await this.getNovel(id);
        if (novel) {
          exportData.novels[id] = novel;
        }
      }
      return JSON.stringify(exportData, null, 2);
    }

    async importLibraryJson(jsonString) {
      if (!jsonString) throw new Error('Dữ liệu nhập không hợp lệ');
      const data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
      if (!data || !data.novels) throw new Error('Cấu trúc file thư viện không đúng chuẩn');

      const existingIds = await this.getStorageIds();
      const payload = {};
      const newIds = [...existingIds];

      for (const [key, novel] of Object.entries(data.novels)) {
        let targetId = String(key);
        while (newIds.includes(targetId)) {
          targetId = String(parseInt(targetId, 10) + 1);
        }
        newIds.push(targetId);

        payload['LibStoryURL' + targetId] = novel.url || '';
        payload['LibFilename' + targetId] = novel.filename || '';
        payload['LibTitle' + targetId] = novel.title || '';
        payload['LibAuthor' + targetId] = novel.author || '';
        payload['LibDescription' + targetId] = novel.description || '';
        payload['LibCover' + targetId] = novel.cover || '';
        payload['LibEpub' + targetId] = novel.epubDataUrl || '';
        payload['LibNewChapterCount' + targetId] = novel.newChapterCount || '0';
        payload['LibUpdatedAt' + targetId] = novel.updatedAt || new Date().toISOString();
      }

      payload['LibArray'] = newIds;
      await this._storageSet(payload);
      return newIds.length;
    }

    async getDownloadableBlob(id) {
      const sid = String(id);
      const data = await this._storageGet(['LibEpub' + sid, 'LibFilename' + sid]);
      const dataUrl = data['LibEpub' + sid];
      if (!dataUrl) throw new Error('Không tìm thấy file EPUB trong thư viện cho truyện này.');
      const blob = await dataUrlToBlob(dataUrl);
      const filename = data['LibFilename' + sid] || `Truyen_${sid}.epub`;
      return { blob, filename: filename.endsWith('.epub') ? filename : `${filename}.epub` };
    }
  }

  return LibraryManager;
});
