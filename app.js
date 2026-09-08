(() => {
  'use strict';

  const formatSelect = document.getElementById('formatSelect');
  const paperWidthSelect = document.getElementById('paperWidth');
  const logoFile = document.getElementById('logoFile');
  const logoThumb = document.getElementById('logoThumb');
  const uploadLabelText = document.getElementById('uploadLabelText');
  const removeLogoBtn = document.getElementById('removeLogoBtn');
  const printBtn = document.getElementById('printBtn');
  const printSystemLink = document.getElementById('printSystemLink');
  const connectBtBtn = document.getElementById('connectBtBtn');
  const resetBtn = document.getElementById('resetBtn');
  const statusLog = document.getElementById('statusLog');
  const connStatus = document.getElementById('connStatus');
  const connText = document.getElementById('connText');

  const DEFAULT_THUMB = '🏷️';

  const receipts = {
    bpcl: document.getElementById('receipt-bpcl'),
    iocl: document.getElementById('receipt-iocl'),
  };

  // ---------- snapshot originals so Reset can restore them ----------
  const originalHTML = {
    bpcl: receipts.bpcl.innerHTML,
    iocl: receipts.iocl.innerHTML,
  };

  function log(msg) {
    const time = new Date().toLocaleTimeString();
    statusLog.textContent += `\n[${time}] ${msg}`;
    statusLog.scrollTop = statusLog.scrollHeight;
  }

  function currentFormat() {
    return formatSelect.value;
  }

  function activeReceipt() {
    return receipts[currentFormat()];
  }

  // ==================== FORMAT SWITCHING ====================
  function applyFormat() {
    const fmt = currentFormat();
    Object.entries(receipts).forEach(([key, el]) => {
      el.classList.toggle('active', key === fmt);
    });
    refreshLogoUI(fmt);
  }
  formatSelect.addEventListener('change', applyFormat);

  // ==================== PAPER WIDTH ====================
  function applyPaperWidth() {
    const mm = paperWidthSelect.value;
    document.documentElement.style.setProperty('--paper-width', `${mm}mm`);
  }
  paperWidthSelect.addEventListener('change', applyPaperWidth);
  applyPaperWidth();

  // ==================== LOGO UPLOAD / REMOVE / PERSISTENCE ====================
  const LOGO_STORAGE_PREFIX = 'billPrinter.logo.';

  function getLogoVisual(fmt) {
    return receipts[fmt].querySelector('.logo-visual');
  }

  function saveLogo(fmt, dataUrl) {
    try {
      localStorage.setItem(LOGO_STORAGE_PREFIX + fmt, dataUrl);
    } catch (err) {
      log(`Could not save logo (${err.message}).`);
    }
  }

  function clearStoredLogo(fmt) {
    try {
      localStorage.removeItem(LOGO_STORAGE_PREFIX + fmt);
    } catch (err) { /* ignore */ }
  }

  function loadStoredLogo(fmt) {
    try {
      return localStorage.getItem(LOGO_STORAGE_PREFIX + fmt);
    } catch (err) {
      return null;
    }
  }

  // Reflect the given format's current logo state into the thumbnail + upload label.
  function refreshLogoUI(fmt) {
    const customSrc = getLogoVisual(fmt).dataset.customSrc;
    logoThumb.innerHTML = customSrc ? `<img src="${customSrc}" alt="logo">` : '';
    if (!customSrc) logoThumb.textContent = DEFAULT_THUMB;
    uploadLabelText.textContent = customSrc ? 'Change' : 'Upload';
  }

  function applyCustomLogo(fmt, dataUrl) {
    const el = getLogoVisual(fmt);
    el.innerHTML = `<img src="${dataUrl}" alt="logo">`;
    el.classList.add('custom-logo');
    el.dataset.default = 'false';
    el.dataset.customSrc = dataUrl;
    receipts[fmt].classList.add('has-custom-logo');
    if (fmt === currentFormat()) refreshLogoUI(fmt);
  }

  function clearCustomLogo(fmt) {
    const el = getLogoVisual(fmt);
    const originalContainer = document.createElement('div');
    originalContainer.innerHTML = originalHTML[fmt];
    const originalVisual = originalContainer.querySelector('.logo-visual');
    el.innerHTML = originalVisual ? originalVisual.innerHTML : '';
    el.classList.remove('custom-logo');
    el.dataset.default = 'true';
    delete el.dataset.customSrc;
    receipts[fmt].classList.remove('has-custom-logo');
    if (fmt === currentFormat()) refreshLogoUI(fmt);
  }

  // restore any logo saved from a previous session
  Object.keys(receipts).forEach((fmt) => {
    const saved = loadStoredLogo(fmt);
    if (saved) applyCustomLogo(fmt, saved);
  });
  applyFormat();

  logoFile.addEventListener('change', () => {
    const file = logoFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const fmt = currentFormat();
      applyCustomLogo(fmt, e.target.result);
      saveLogo(fmt, e.target.result);
      log(`Logo saved for ${fmt.toUpperCase()} template.`);
    };
    reader.readAsDataURL(file);
  });

  removeLogoBtn.addEventListener('click', () => {
    const fmt = currentFormat();
    clearCustomLogo(fmt);
    clearStoredLogo(fmt);
    logoFile.value = '';
    log(`Logo reset to default for ${fmt.toUpperCase()} template.`);
  });

  // ==================== RESET FIELDS ====================
  resetBtn.addEventListener('click', () => {
    const fmt = currentFormat();
    receipts[fmt].innerHTML = originalHTML[fmt];
    receipts[fmt].classList.remove('has-custom-logo');
    clearStoredLogo(fmt);
    logoFile.value = '';
    refreshLogoUI(fmt);
    log(`${fmt.toUpperCase()} template reset to defaults.`);
  });

  // ==================== SYSTEM PRINT ====================
  printSystemLink.addEventListener('click', () => {
    window.print();
  });

  // ==================== BLUETOOTH ESC/POS PRINTING ====================
  const KNOWN_PRINTER_SERVICES = [
    '000018f0-0000-1000-8000-00805f9b34fb',
    '0000ff00-0000-1000-8000-00805f9b34fb',
    '0000ffe0-0000-1000-8000-00805f9b34fb',
    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  ];

  let btDevice = null;
  let btCharacteristic = null;

  if (!('bluetooth' in navigator)) {
    connectBtBtn.disabled = true;
    connectBtBtn.title = 'Web Bluetooth is not supported in this browser.';
    log('Web Bluetooth not supported in this browser (use Chrome/Edge on desktop or Android).');
  }

  function setConnected(name) {
    connStatus.dataset.state = 'on';
    connText.textContent = `Connected to ${name} — Bluetooth print ready`;
    connectBtBtn.textContent = '🔌 Disconnect Bluetooth Printer';
  }

  function setDisconnected() {
    connStatus.dataset.state = 'off';
    connText.textContent = 'Not connected — Print uses the system dialog';
    connectBtBtn.textContent = '🔗 Connect Bluetooth Printer';
  }

  function onDisconnected() {
    log('Bluetooth printer disconnected.');
    btCharacteristic = null;
    setDisconnected();
  }

  async function findWritableCharacteristic(server) {
    const services = await server.getPrimaryServices();
    for (const service of services) {
      const chars = await service.getCharacteristics();
      for (const ch of chars) {
        if (ch.properties.writeWithoutResponse || ch.properties.write) {
          return ch;
        }
      }
    }
    return null;
  }

  connectBtBtn.addEventListener('click', async () => {
    if (btDevice && btDevice.gatt.connected) {
      btDevice.gatt.disconnect();
      return;
    }
    try {
      connectBtBtn.disabled = true;
      log('Requesting Bluetooth device...');
      btDevice = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: KNOWN_PRINTER_SERVICES,
      });
      log(`Selected device: ${btDevice.name || '(unnamed)'}`);
      btDevice.addEventListener('gattserverdisconnected', onDisconnected);

      const server = await btDevice.gatt.connect();
      const found = await findWritableCharacteristic(server);
      if (!found) {
        throw new Error('No writable characteristic found on this device.');
      }

      btCharacteristic = found;
      setConnected(btDevice.name || 'printer');
      log(`Connected. Ready to print (characteristic ${found.uuid}).`);
    } catch (err) {
      log(`Connection failed: ${err.message}`);
    } finally {
      connectBtBtn.disabled = false;
    }
  });

  // Cheap BLE thermal printers often drop the connection after a few idle
  // seconds to save power. Rather than making the user click "Connect" again
  // every time, silently reconnect to the already-chosen device right before
  // printing (no picker dialog needed — permission was already granted).
  async function ensureConnected() {
    if (btCharacteristic && btDevice && btDevice.gatt.connected) return true;
    if (!btDevice) return false;
    try {
      log('Printer was disconnected — reconnecting...');
      const server = await btDevice.gatt.connect();
      const found = await findWritableCharacteristic(server);
      if (!found) throw new Error('No writable characteristic found on reconnect.');
      btCharacteristic = found;
      setConnected(btDevice.name || 'printer');
      log('Reconnected.');
      return true;
    } catch (err) {
      log(`Reconnect failed: ${err.message}`);
      return false;
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function sendBytes(bytes) {
    const CHUNK = 180;
    const data = Uint8Array.from(bytes);
    for (let i = 0; i < data.length; i += CHUNK) {
      const chunk = data.slice(i, i + CHUNK);
      if (btCharacteristic.properties.writeWithoutResponse) {
        await btCharacteristic.writeValueWithoutResponse(chunk);
      } else {
        await btCharacteristic.writeValue(chunk);
      }
      await sleep(20);
    }
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function buildLogoRaster(dataUrl, targetWidthPx) {
    const img = await loadImage(dataUrl);
    const scale = targetWidthPx / img.width;
    const targetHeightPx = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidthPx;
    canvas.height = targetHeightPx;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, targetWidthPx, targetHeightPx);
    ctx.drawImage(img, 0, 0, targetWidthPx, targetHeightPx);

    const imgData = ctx.getImageData(0, 0, targetWidthPx, targetHeightPx).data;
    const widthBytes = Math.ceil(targetWidthPx / 8);
    const raster = new Uint8Array(widthBytes * targetHeightPx);

    for (let y = 0; y < targetHeightPx; y++) {
      for (let x = 0; x < targetWidthPx; x++) {
        const idx = (y * targetWidthPx + x) * 4;
        const r = imgData[idx], g = imgData[idx + 1], b = imgData[idx + 2], a = imgData[idx + 3];
        const lum = a < 128 ? 255 : (0.299 * r + 0.587 * g + 0.114 * b);
        if (lum < 160) {
          const byteIndex = y * widthBytes + (x >> 3);
          raster[byteIndex] |= (0x80 >> (x & 7));
        }
      }
    }

    const header = [
      0x1D, 0x76, 0x30, 0x00,
      widthBytes & 0xFF, (widthBytes >> 8) & 0xFF,
      targetHeightPx & 0xFF, (targetHeightPx >> 8) & 0xFF,
    ];
    return header.concat(Array.from(raster));
  }

  // ESC/POS byte helpers
  const ESC_INIT = [0x1B, 0x40];
  const ALIGN_LEFT = [0x1B, 0x61, 0x00];
  const ALIGN_CENTER = [0x1B, 0x61, 0x01];
  const BOLD_ON = [0x1B, 0x45, 0x01];
  const BOLD_OFF = [0x1B, 0x45, 0x00];
  const DOUBLE_SIZE = [0x1D, 0x21, 0x11];
  const NORMAL_SIZE = [0x1D, 0x21, 0x00];
  const FEED_CUT = [0x1B, 0x64, 0x03, 0x1D, 0x56, 0x42, 0x00];

  function textBytes(str) {
    const bytes = [];
    // &nbsp; (U+00A0) prints as garbled accented characters on most thermal
    // printer codepages, so normalize it to a plain space first.
    const normalized = String(str).replace(/ /g, ' ');
    for (const ch of normalized) {
      const code = ch.charCodeAt(0);
      bytes.push(code <= 255 ? code : 0x3F); // fall back to '?' for unsupported chars
    }
    bytes.push(0x0A);
    return bytes;
  }

  function padLine(label, value, width) {
    const combined = `${label} ${value}`;
    if (combined.length >= width) return combined;
    const padding = width - label.length - value.length;
    return label + ' '.repeat(Math.max(1, padding)) + value;
  }

  function getFieldRows(receiptEl) {
    return Array.from(receiptEl.querySelectorAll('.field-row')).map((row) => ({
      label: row.querySelector('.label')?.innerText.trim() ?? '',
      value: row.querySelector('.value')?.innerText.trim() ?? '',
    }));
  }

  async function buildReceiptBytes(charWidth) {
    const fmt = currentFormat();
    const receiptEl = activeReceipt();
    const logoVisual = getLogoVisual(fmt);
    const customSrc = logoVisual.dataset.customSrc;

    let bytes = [...ESC_INIT];

    bytes.push(...ALIGN_CENTER);
    if (customSrc) {
      // match the logo's on-screen proportion, not a fixed near-full-width raster
      const badge = fmt === 'bpcl' ? receiptEl.querySelector('.logo-badge') : receiptEl.querySelector('.logo-circle');
      const ratio = badge.getBoundingClientRect().width / receiptEl.getBoundingClientRect().width;
      const totalDots = charWidth <= 32 ? 384 : 576; // standard 58mm/80mm printable dot widths
      const rasterWidth = Math.max(24, Math.round(totalDots * ratio));
      const rasterBytes = await buildLogoRaster(customSrc, rasterWidth);
      bytes.push(...rasterBytes);
      bytes.push(0x0A);
    } else {
      // only print the default brand caption when there's no custom logo replacing it
      bytes.push(...BOLD_ON, ...DOUBLE_SIZE);
      const brandText = fmt === 'bpcl'
        ? receiptEl.querySelector('.logo-caption').innerText.replace(/\n/g, ' ')
        : receiptEl.querySelector('.logo-brand').innerText;
      bytes.push(...textBytes(brandText));
      bytes.push(...NORMAL_SIZE, ...BOLD_OFF);
    }

    if (fmt === 'bpcl') {
      receiptEl.querySelectorAll('.addr-line').forEach((line) => {
        bytes.push(...textBytes(line.innerText.trim()));
      });
    } else {
      bytes.push(...ALIGN_LEFT);
      receiptEl.querySelectorAll('.addr-line').forEach((line) => {
        bytes.push(...textBytes(line.innerText.trim()));
      });
    }

    bytes.push(...ALIGN_LEFT);

    getFieldRows(receiptEl).forEach(({ label, value }) => {
      if (!value && !label) {
        bytes.push(...textBytes(''));
        return;
      }
      // IndianOil pads labels to a fixed 7-char column before the colon (see .field-row .label{width:7ch}
      // in styles.css); BPCL right-justifies the value against the paper width like every other row.
      const line = fmt === 'iocl'
        ? `${label.padEnd(7)}:${value}`
        : padLine(label, value, charWidth);
      bytes.push(...textBytes(line));
    });

    if (fmt === 'bpcl') {
      bytes.push(...ALIGN_CENTER);
      const thanks = receiptEl.querySelector('.thanks')?.innerText.trim();
      if (thanks) bytes.push(...textBytes(thanks));
    }

    bytes.push(...FEED_CUT);
    return bytes;
  }

  async function printViaBluetooth() {
    try {
      printBtn.disabled = true;
      log('Building receipt data...');
      const charWidth = paperWidthSelect.value === '58' ? 32 : 48;
      const bytes = await buildReceiptBytes(charWidth);
      log(`Sending ${bytes.length} bytes to printer...`);
      await sendBytes(bytes);
      log('Print job sent successfully.');
    } catch (err) {
      log(`Print failed: ${err.message}`);
    } finally {
      printBtn.disabled = false;
    }
  }

  printBtn.addEventListener('click', async () => {
    if (btDevice) {
      printBtn.disabled = true;
      const connected = await ensureConnected();
      printBtn.disabled = false;
      if (connected) {
        printViaBluetooth();
        return;
      }
      log('Could not reach the Bluetooth printer — falling back to the system dialog.');
    }
    window.print();
  });

})();
