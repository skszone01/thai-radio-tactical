/**
 * ว.TACTICAL : ระบบสังเคราะห์เสียงวิทยุสื่อสาร (Synthesized Tactical Radio Audio Engine)
 * ใช้ Web Audio API สร้างเสียงคีย์วิทยุ (PTT Click), เสียงซ่าคลื่นวิทยุ (VHF Squelch Noise),
 * เสียงปล่อยคีย์ (Roger Beep), เสียงแจ้งเตือนคำตอบ และระบบอ่านออกเสียงภาษาไทยแบบ Dual-Engine
 * (รองรับทั้ง Desktop Windows/Mac ทุกเบราว์เซอร์ และ Mobile iOS/Android โดยไม่อ่านเพี้ยนเป็นภาษาอังกฤษและไม่ตัดจบกลางคัน)
 */

class TacticalRadioAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.speaking = false;
    this.activeTimers = new Set();
    this.activeOnEnd = null;
    this.activeAudio = null;
    this.activeUtterance = null;
    this.cachedVoices = [];
    this.speechToken = 0;
    this.loadPreference();
    this._initVoices();
  }

  _initVoices() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !window.speechSynthesis) {
      return;
    }
    const updateVoices = () => {
      try {
        const list = window.speechSynthesis.getVoices();
        if (Array.isArray(list) && list.length > 0) {
          this.cachedVoices = list;
        }
      } catch (e) {}
    };
    updateVoices();
    try {
      if ('onvoiceschanged' in window.speechSynthesis) {
        window.speechSynthesis.addEventListener('voiceschanged', updateVoices);
      }
    } catch (e) {}
  }

  _findVerifiedThaiVoice() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !window.speechSynthesis) {
      return null;
    }
    let voices = this.cachedVoices;
    try {
      const fresh = window.speechSynthesis.getVoices();
      if (Array.isArray(fresh) && fresh.length > 0) {
        voices = fresh;
        this.cachedVoices = fresh;
      }
    } catch (e) {}

    if (!Array.isArray(voices) || voices.length === 0) return null;

    const thaiVoices = voices.filter(v => {
      if (!v) return false;
      const lang = String(v.lang || '').toLowerCase();
      const name = String(v.name || '').toLowerCase();
      return (
        lang === 'th' ||
        lang.startsWith('th-') ||
        lang.startsWith('th_') ||
        name.includes('thai') ||
        name.includes('ไทย') ||
        name.includes('premwadee') ||
        name.includes('niwat') ||
        name.includes('pattara') ||
        name.includes('kanya') ||
        name.includes('narisa') ||
        name.includes('เปรมวดี') ||
        name.includes('นิวัฒน์') ||
        name.includes('ภัทรา')
      );
    });

    if (thaiVoices.length === 0) return null;

    // ให้ลำดับความสำคัญกับเสียง Natural / Google ภาษาไทย / เสียงไทยแท้
    const preferred = thaiVoices.find(v => {
      const n = String(v.name || '').toLowerCase();
      return n.includes('natural') || n.includes('premwadee') || n.includes('niwat') || n.includes('เปรมวดี') || n.includes('นิวัฒน์') || n.includes('google');
    });
    return preferred || thaiVoices[0];
  }

  _isDesktopDevice() {
    if (typeof navigator === 'undefined') return true;
    const ua = String(navigator.userAgent || '');
    return !/Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  }

  _setTimer(callback, delayMs) {
    const safeDelay = Math.max(0, Number(delayMs) || 0);
    const timerId = setTimeout(() => {
      this.activeTimers.delete(timerId);
      try {
        callback();
      } catch (e) {}
    }, safeDelay);
    this.activeTimers.add(timerId);
    return timerId;
  }

  _clearTimers() {
    for (const timerId of this.activeTimers) {
      clearTimeout(timerId);
    }
    this.activeTimers.clear();
  }

  _stopActiveAudioElement() {
    if (this.activeAudio) {
      try {
        this.activeAudio.onended = null;
        this.activeAudio.onerror = null;
        this.activeAudio.pause();
        this.activeAudio.src = '';
      } catch (e) {}
      this.activeAudio = null;
    }
  }

  _finishActiveSpeech(withRogerBeep = true) {
    this._clearTimers();
    this._stopActiveAudioElement();
    this.activeUtterance = null;
    this.speaking = false;
    if (withRogerBeep && this.enabled) {
      this.playRogerBeep();
    }
    const cb = this.activeOnEnd;
    this.activeOnEnd = null;
    if (typeof cb === 'function') {
      try {
        cb();
      } catch (e) {}
    }
  }

  loadPreference() {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('wo_tactical_audio');
        if (saved !== null) {
          this.enabled = saved === 'true';
        }
      }
    } catch (e) {
      this.enabled = true;
    }
  }

  toggleAudio() {
    this.enabled = !this.enabled;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('wo_tactical_audio', String(this.enabled));
      }
    } catch (e) {}

    if (this.enabled) {
      this.playRogerBeep();
    } else {
      this.stopSpeech();
    }
    return this.enabled;
  }

  ensureContext() {
    if (!this.enabled || typeof window === 'undefined') return null;
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (typeof AudioCtx === 'function') {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
        this.ctx.resume().catch(() => {});
      }
    } catch (e) {
      return null;
    }
    if (!this.ctx || typeof this.ctx.currentTime !== 'number' || !this.ctx.destination) {
      return null;
    }
    return this.ctx;
  }

  /**
   * เสียงกดคีย์วิทยุ (PTT Key-Down Click + Short Carrier Burst)
   */
  playPttPress() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.035);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.038);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);

      this.playSquelchBurst(0.06, 0.045);
    } catch (e) {}
  }

  /**
   * เสียงปล่อยคีย์วิทยุ (Motorola/Tactical Dual-Tone Roger Beep + Squelch Tail)
   */
  playRogerBeep() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1320, now);
      osc.frequency.setValueAtTime(1046, now + 0.045);

      gain.gain.setValueAtTime(0.11, now);
      gain.gain.setValueAtTime(0.11, now + 0.085);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.115);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);

      setTimeout(() => {
        if (this.enabled) {
          this.playSquelchBurst(0.09, 0.055);
        }
      }, 95);
    } catch (e) {}
  }

  /**
   * เสียงซ่าคลื่นวิทยุ (Bandpass-Filtered White Noise Squelch Tail)
   */
  playSquelchBurst(duration = 0.08, volume = 0.05) {
    const safeDuration = Math.max(0.01, Math.min(2.0, Number(duration) || 0.08));
    const safeVolume = Math.max(0.001, Math.min(0.5, Number(volume) || 0.05));

    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const sampleRate = Math.max(8000, Number(ctx.sampleRate) || 44100);
      const frameCount = Math.max(1, Math.floor(sampleRate * safeDuration));
      const buffer = ctx.createBuffer(1, frameCount, sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < frameCount; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.8;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(1650, now);
      bandpass.Q.setValueAtTime(1.8, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(safeVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + safeDuration);

      noise.connect(bandpass);
      bandpass.connect(gain);
      gain.connect(ctx.destination);

      noise.start(now);
      noise.stop(now + safeDuration);
    } catch (e) {}
  }

  /**
   * เสียงยืนยันคำตอบถูกต้อง (Tactical Confirmation Chime)
   */
  playCorrect() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1318.5, now + 0.065);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.19);
    } catch (e) {}
  }

  /**
   * เสียงแจ้งเตือนคำตอบผิดหรือหมดเวลา (Low Double Buzz)
   */
  playError() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(210, now);
      osc.frequency.setValueAtTime(165, now + 0.09);

      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.23);
    } catch (e) {}
  }

  /**
   * เสียงติ๊กจับเวลาเมื่อใกล้หมดเวลา
   */
  playTick(urgent = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const isUrgent = Boolean(urgent);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isUrgent ? 1200 : 780, now);

      gain.gain.setValueAtTime(isUrgent ? 0.08 : 0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
    } catch (e) {}
  }

  /**
   * แปลงรหัส ว., รหัส ท., และคำย่อทางยุทธวิธีให้ออกเสียงภาษาไทยอย่างเป็นธรรมชาติครบถ้วน
   */
  formatRadioTextForSpeech(rawText) {
    return String(rawText == null ? '' : rawText)
      .replace(/ว\.00/g, 'วอ ศูนย์ ศูนย์ ')
      .replace(/ว\.01/g, 'วอ ศูนย์ หนึ่ง ')
      .replace(/ว\.(\d+)/g, 'วอ $1 ')
      .replace(/ท\.0(\d)/g, 'ทอ ศูนย์ $1 ')
      .replace(/ท\.(\d+)/g, 'ทอ $1 ')
      .replace(/บก\.ควบคุม/g, 'บอ กอ ควบคุม')
      .replace(/บก\.ฉก\./g, 'บอ กอ ฉอ กอ ')
      .replace(/กกล\./g, 'กองกำลัง ')
      .replace(/ชป\./g, 'ชุดปฏิบัติการ ')
      .replace(/ลว\./g, 'ลาดตระเวน ')
      .replace(/ตชด\./g, 'ตอ ชอ ดอ ')
      .replace(/ทพ\./g, 'ทหารพราน ')
      .replace(/สภ\./g, 'สอ พอ ')
      .replace(/กม\.(\d+)/g, 'กิโลเมตรที่ $1 ')
      .replace(/ฮ\./g, 'เฮลิคอปเตอร์ ')
      .replace(/MGRS/gi, 'เอ็ม จี อาร์ เอส ')
      .replace(/SALUTE/gi, 'ซาลูท ')
      .replace(/MEDEVAC/gi, 'เมด อี แวค ')
      .replace(/CASEVAC/gi, 'แคส อี แวค ')
      .replace(/COMSEC/gi, 'คอม เส็ค ')
      .replace(/EMCON/gi, 'เอ็ม คอน ')
      .replace(/EOD/gi, 'อี โอ ดี ')
      .replace(/QRF/gi, 'คิว อาร์ เอฟ ')
      .replace(/\//g, ' หรือ ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * แบ่งประโยคยาวออกเป็นส่วนย่อยไม่เกิน 145 ตัวอักษร เพื่อให้อ่านจบครบทุกคำโดยไม่ถูกตัดกลางคัน
   */
  _splitTextIntoChunks(text, maxLen = 145) {
    const clean = String(text || '').trim();
    if (!clean) return [];
    if (clean.length <= maxLen) return [clean];

    const words = clean.split(' ');
    const chunks = [];
    let current = '';

    for (const word of words) {
      if (!word) continue;
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maxLen && current) {
        chunks.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  /**
   * อ่านออกเสียงภาษาไทยผ่าน Cloud Thai TTS Stream (แก้ปัญหา Windows PC ไม่มีชุดเสียงภาษาไทยแล้วอ่านเป็นภาษาอังกฤษ)
   */
  _speakViaCloudTts(spokenText, token, onFallbackNeeded) {
    const chunks = this._splitTextIntoChunks(spokenText, 145);
    if (chunks.length === 0) {
      this._finishActiveSpeech(true);
      return;
    }

    let idx = 0;
    const playNextChunk = () => {
      if (token !== this.speechToken) return;
      if (idx >= chunks.length) {
        this._finishActiveSpeech(true);
        return;
      }

      const chunk = chunks[idx++];
      try {
        this._stopActiveAudioElement();
        const audio = new Audio();
        audio.referrerPolicy = 'no-referrer';
        audio.preload = 'auto';
        audio.playbackRate = 1.08;
        audio.src = 'https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=th&client=tw-ob&q=' + encodeURIComponent(chunk);
        this.activeAudio = audio;

        let chunkDone = false;
        const watchdogId = this._setTimer(() => {
          if (chunkDone || token !== this.speechToken) return;
          chunkDone = true;
          playNextChunk();
        }, 24000);

        audio.onended = () => {
          if (chunkDone || token !== this.speechToken) return;
          chunkDone = true;
          clearTimeout(watchdogId);
          this.activeTimers.delete(watchdogId);
          playNextChunk();
        };

        audio.onerror = () => {
          if (chunkDone || token !== this.speechToken) return;
          chunkDone = true;
          clearTimeout(watchdogId);
          this.activeTimers.delete(watchdogId);
          if (idx === 1 && typeof onFallbackNeeded === 'function') {
            onFallbackNeeded();
          } else {
            playNextChunk();
          }
        };

        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {
            if (chunkDone || token !== this.speechToken) return;
            chunkDone = true;
            clearTimeout(watchdogId);
            this.activeTimers.delete(watchdogId);
            if (idx === 1 && typeof onFallbackNeeded === 'function') {
              onFallbackNeeded();
            } else {
              playNextChunk();
            }
          });
        }
      } catch (e) {
        if (idx === 1 && typeof onFallbackNeeded === 'function') {
          onFallbackNeeded();
        } else {
          this._finishActiveSpeech(true);
        }
      }
    };

    playNextChunk();
  }

  /**
   * อ่านออกเสียงผ่าน Web Speech API เฉพาะเมื่อตรวจสอบแล้วว่ามีเสียงภาษาไทย (th-TH) แท้ในระบบ
   */
  _speakViaNativeSpeechSynthesis(spokenText, thaiVoice, token, onFallbackNeeded) {
    if (
      typeof window === 'undefined' ||
      !('speechSynthesis' in window) ||
      !window.speechSynthesis ||
      typeof window.SpeechSynthesisUtterance !== 'function' ||
      !thaiVoice
    ) {
      if (typeof onFallbackNeeded === 'function') {
        onFallbackNeeded();
      } else {
        this._finishActiveSpeech(true);
      }
      return;
    }

    try {
      const startTime = performance.now();
      const utter = new window.SpeechSynthesisUtterance(spokenText);
      // เก็บ Reference ไว้ที่ Instance เพื่อป้องกัน V8 Garbage Collector ลบ Utterance กลางคันบน Desktop
      this.activeUtterance = utter;
      utter.voice = thaiVoice;
      utter.lang = thaiVoice.lang || 'th-TH';
      utter.rate = 1.06;
      utter.pitch = 0.96;

      let finished = false;
      const finishHandler = () => {
        if (finished || token !== this.speechToken) return;
        finished = true;
        this.activeUtterance = null;
        this._finishActiveSpeech(true);
      };

      utter.onend = () => {
        const elapsed = performance.now() - startTime;
        // หากประโยคยาวแต่จบภายในไม่ถึง 350ms แสดงว่าเอนจินข้ามตัวอักษรไทย ให้สลับไปใช้ Cloud Thai TTS ทันที
        if (elapsed < 350 && spokenText.length > 12 && typeof onFallbackNeeded === 'function') {
          if (finished || token !== this.speechToken) return;
          finished = true;
          this.activeUtterance = null;
          onFallbackNeeded();
          return;
        }
        finishHandler();
      };

      utter.onerror = (ev) => {
        if (finished || token !== this.speechToken) return;
        const errType = ev && ev.error ? String(ev.error) : '';
        if (errType === 'canceled' || errType === 'interrupted') {
          return;
        }
        finished = true;
        this.activeUtterance = null;
        if (typeof onFallbackNeeded === 'function') {
          onFallbackNeeded();
        } else {
          this._finishActiveSpeech(true);
        }
      };

      // Keep-alive ป้องกัน Chrome Desktop หยุดอ่านประโยคยาวเกิน 14 วินาที
      const keepAlive = () => {
        if (finished || token !== this.speechToken) return;
        try {
          if (window.speechSynthesis && window.speechSynthesis.speaking) {
            window.speechSynthesis.pause();
            window.speechSynthesis.resume();
          }
        } catch (e) {}
        this._setTimer(keepAlive, 5000);
      };
      this._setTimer(keepAlive, 5000);

      // Watchdog เผื่อเวลาให้ประโยคยาวอ่านจบครบ 100% (สูงสุด 35 วินาที)
      const maxWaitMs = Math.min(35000, Math.max(8000, spokenText.length * 260));
      this._setTimer(finishHandler, maxWaitMs);

      window.speechSynthesis.speak(utter);
    } catch (e) {
      if (typeof onFallbackNeeded === 'function') {
        onFallbackNeeded();
      } else {
        this._finishActiveSpeech(true);
      }
    }
  }

  /**
   * อ่านออกเสียงประโยควิทยุสื่อสารภาษาไทย พร้อมเอฟเฟกต์กดคีย์-ปล่อยคีย์
   */
  speakTransmission(text, onStart, onEnd) {
    // หยุดเสียงที่กำลังเล่นอยู่โดยไม่ทริกเกอร์ callback ของประโยคเก่า
    this.stopSpeech();

    const rawText = text == null ? '' : String(text).trim();
    if (!this.enabled || !rawText) {
      if (typeof onEnd === 'function') {
        try {
          onEnd();
        } catch (e) {}
      }
      return;
    }

    const token = ++this.speechToken;
    this.activeOnEnd = typeof onEnd === 'function' ? onEnd : null;
    this.speaking = true;

    this.playPttPress();
    if (typeof onStart === 'function') {
      try {
        onStart();
      } catch (e) {}
    }

    const spokenText = this.formatRadioTextForSpeech(rawText);
    const verifiedThaiVoice = this._findVerifiedThaiVoice();
    const isDesktop = this._isDesktopDevice();

    // บนคอมพิวเตอร์ (Desktop) หรือเครื่องที่ไม่มีชุดเสียงภาษาไทยใน OS ให้ใช้ Cloud Thai TTS เป็นหลัก
    // เพื่อให้ได้เสียงภาษาไทยแท้ 100% ไม่อ่านเป็นภาษาอังกฤษ (Microsoft David) และอ่านจบครบทุกประโยค
    this._setTimer(() => {
      if (token !== this.speechToken) return;

      if (isDesktop || !verifiedThaiVoice) {
        this._speakViaCloudTts(spokenText, token, () => {
          if (verifiedThaiVoice) {
            this._speakViaNativeSpeechSynthesis(spokenText, verifiedThaiVoice, token, null);
          } else {
            this._finishActiveSpeech(true);
          }
        });
      } else {
        this._speakViaNativeSpeechSynthesis(spokenText, verifiedThaiVoice, token, () => {
          this._speakViaCloudTts(spokenText, token, null);
        });
      }
    }, 80);
  }

  stopSpeech() {
    this.speechToken++;
    this._clearTimers();
    this._stopActiveAudioElement();
    this.activeUtterance = null;
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis) {
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
          window.speechSynthesis.cancel();
        }
      }
    } catch (e) {}
    this.speaking = false;
    this.activeOnEnd = null;
  }
}

window.radioAudio = new TacticalRadioAudio();
